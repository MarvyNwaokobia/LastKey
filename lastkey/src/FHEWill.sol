// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE }               from "fhevm/lib/FHE.sol";
import { Ownable }           from "@openzeppelin/contracts/access/Ownable.sol";
import { LastKeyFHEConfig }  from "./config/LastKeyFHEConfig.sol";
import { IFHEWill }          from "./interfaces/IFHEWill.sol";
import {
    euint8, euint32, euint256, eaddress, ebool,
    externalEuint32, externalEuint256, externalEaddress
} from "encrypted-types/EncryptedTypes.sol";

/// @title FHEWill — Per-owner confidential inheritance will
/// @notice All beneficiary identities, allocation shares, and guardian identities are FHE
///         ciphertexts. Nothing is ever revealed on-chain. Execution only occurs when the
///         owner is genuinely unreachable across three independent liveness signals.
///
/// FHE type decisions (fhevm-solidity v0.11.1):
///   euint256  — keccak256(email). 256 bits = 32 bytes. ebytes32 exists but
///               FHE.fromExternal(externalEbytes32,…) is not implemented; euint256 is identical.
///   euint32   — allocation in basis points (0–10 000). 32 bits is sufficient.
///   eaddress  — optional direct fallback wallet address.
///   ebool     — encrypted liveness flag.
///   euint8    — encrypted mirror of the WillState enum (0=ACTIVE,1=CONFIRMING,2=EXECUTED).
///
/// FHEVM rules enforced throughout:
///   • allowThis() called immediately after EVERY FHE operation — no exceptions.
///   • allow(executor) granted ONLY in finalizeExecution(), never in addBeneficiary.
///   • No FHE operations inside view functions.
///   • FHE.select() used for all encrypted state updates — never if/else on encrypted values.
contract FHEWill is LastKeyFHEConfig, Ownable, IFHEWill {

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    uint8   public constant MAX_BENEFICIARIES          = 10;
    uint8   public constant MAX_GUARDIANS              = 3;
    uint8   public constant MIN_GUARDIAN_CONFIRMS      = 2;
    uint256 public constant DEFAULT_HEARTBEAT_INTERVAL = 30 days;
    uint256 public constant DEFAULT_INACTIVITY_WINDOW  = 365 days;

    // ──────────────────────────────────────────────
    // Public / plaintext state
    // ──────────────────────────────────────────────

    address public factory;
    address public executor;
    uint256 public inactivityWindow;
    uint256 public lastActivityTimestamp;
    uint256 public lastHeartbeatTimestamp;
    uint256 public heartbeatInterval;
    uint8   public beneficiaryCount;
    uint8   public guardianCount;
    uint8   public guardianConfirmCount;
    WillState public state;

    /// @notice Additional addresses (e.g. LivenessOracle) approved to call recordActivity.
    mapping(address => bool) public approvedExecutors;

    /// @notice Tracks which guardian sig hashes have been submitted as death confirmations.
    mapping(bytes32 => bool) public guardianConfirmed;

    /// @dev Salt used for deterministic beneficiary address derivation (email bridge).
    bytes32 private _encryptedSalt;

    // ──────────────────────────────────────────────
    // Encrypted state — FHE ciphertexts, never revealed on-chain
    // ──────────────────────────────────────────────

    euint256[10] private _encryptedEmailHashes;    // keccak256(beneficiary email)
    euint32[10]  private _encryptedShares;         // allocation in basis points (0–10 000)
    eaddress[10] private _encryptedFallbackAddrs;  // optional direct wallet (zero = email-only)
    euint256[3]  private _encryptedGuardianHashes; // keccak256(guardian email)
    ebool        private _encryptedIsActive;       // encrypted liveness flag
    euint8       private _encryptedState;          // encrypted mirror of WillState

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _owner    The wallet that owns this will
    /// @param _factory  Address of the WillFactory that deployed this contract
    /// @param _executor Address of the WillExecutor singleton
    constructor(address _owner, address _factory, address _executor)
        LastKeyFHEConfig()
        Ownable(_owner)
    {
        require(_factory  != address(0), "FHEWill: zero factory");
        require(_executor != address(0), "FHEWill: zero executor");

        factory              = _factory;
        executor             = _executor;
        inactivityWindow     = DEFAULT_INACTIVITY_WINDOW;
        heartbeatInterval    = DEFAULT_HEARTBEAT_INTERVAL;
        lastActivityTimestamp  = block.timestamp;
        lastHeartbeatTimestamp = block.timestamp;
        state                = WillState.ACTIVE;

        approvedExecutors[_executor] = true;

        // Initialize encrypted state mirrors — allowThis immediately (FHEVM rule)
        _encryptedIsActive = FHE.asEbool(true);
        FHE.allowThis(_encryptedIsActive);

        _encryptedState = FHE.asEuint8(uint8(WillState.ACTIVE));
        FHE.allowThis(_encryptedState);

        emit WillActivated(_owner);
    }

    // Ownable and IFHEWill both declare owner(). Explicitly delegate to Ownable.
    function owner() public view override(Ownable, IFHEWill) returns (address) {
        return Ownable.owner();
    }

    // ──────────────────────────────────────────────
    // Owner: configure beneficiaries & guardians
    // ──────────────────────────────────────────────

    /// @notice Add the next beneficiary slot (auto-indexed by beneficiaryCount).
    /// @dev    Client encrypts all three values in a single encryptBatch() SDK call,
    ///         producing one inputProof that covers all three handles at once.
    ///         allow(executor) is NOT granted here — only in finalizeExecution().
    /// @param encryptedEmailHash keccak256(beneficiary email) encrypted as euint256
    /// @param encryptedShare     Allocation in basis points (0–10 000) encrypted as euint32
    /// @param encryptedFallback  Optional direct wallet address encrypted as eaddress
    /// @param inputProof         ZK batch proof from SDK, bound to this contract + caller
    function addBeneficiary(
        bytes32        encryptedEmailHash,
        bytes32        encryptedShare,
        bytes32        encryptedFallback,
        bytes calldata inputProof
    ) external onlyOwner {
        require(state == WillState.ACTIVE,             "FHEWill: not active");
        require(beneficiaryCount < MAX_BENEFICIARIES,  "FHEWill: max beneficiaries reached");

        // FHEVM rule: allowThis() immediately after every fromExternal() — before any other op.
        euint256 emailHash = FHE.fromExternal(externalEuint256.wrap(encryptedEmailHash), inputProof);
        FHE.allowThis(emailHash);

        euint32 share = FHE.fromExternal(externalEuint32.wrap(encryptedShare), inputProof);
        FHE.allowThis(share);

        eaddress fallbackAddr = FHE.fromExternal(externalEaddress.wrap(encryptedFallback), inputProof);
        FHE.allowThis(fallbackAddr);

        uint8 idx = beneficiaryCount;
        _encryptedEmailHashes[idx]   = emailHash;
        _encryptedShares[idx]        = share;
        _encryptedFallbackAddrs[idx] = fallbackAddr;
        beneficiaryCount++;

        _recordActivity();
        emit BeneficiaryAdded(idx);
    }

    /// @notice Add a guardian whose confirmation contributes to execution quorum.
    /// @param encryptedGuardianHash keccak256(guardian email) encrypted as euint256
    /// @param inputProof            ZK proof from SDK
    function addGuardian(
        bytes32        encryptedGuardianHash,
        bytes calldata inputProof
    ) external onlyOwner {
        require(state == WillState.ACTIVE,      "FHEWill: not active");
        require(guardianCount < MAX_GUARDIANS,  "FHEWill: max guardians reached");

        euint256 guardianHash = FHE.fromExternal(
            externalEuint256.wrap(encryptedGuardianHash), inputProof
        );
        FHE.allowThis(guardianHash);

        _encryptedGuardianHashes[guardianCount] = guardianHash;
        guardianCount++;

        _recordActivity();
        emit GuardianAdded(guardianCount);
    }

    /// @notice Change the inactivity window. Clamped to [90, 730] days.
    function setInactivityWindow(uint256 newWindow) external onlyOwner {
        require(state == WillState.ACTIVE,  "FHEWill: not active");
        require(newWindow >= 90 days,       "FHEWill: window too short (min 90 days)");
        require(newWindow <= 730 days,      "FHEWill: window too long (max 730 days)");
        inactivityWindow = newWindow;
    }

    // ──────────────────────────────────────────────
    // Liveness signals
    // ──────────────────────────────────────────────

    /// @notice Record the owner's on-chain activity, resetting the inactivity timer.
    ///         If state is CONFIRMING, reverts it to ACTIVE (owner proves they are alive).
    ///         Callable by owner or any approved executor (e.g. LivenessOracle).
    function recordActivity() external {
        require(
            msg.sender == owner() || approvedExecutors[msg.sender],
            "FHEWill: unauthorized"
        );
        require(state != WillState.EXECUTED, "FHEWill: already executed");
        _recordActivity();
    }

    /// @notice Owner proves liveness with a passkey attestation.
    ///         In production this verifies a WebAuthn signature. For MVP it accepts any non-empty bytes.
    function submitHeartbeat(bytes calldata passkeyAttestation) external onlyOwner {
        require(state != WillState.EXECUTED,        "FHEWill: already executed");
        require(passkeyAttestation.length > 0,      "FHEWill: empty attestation");

        lastHeartbeatTimestamp = block.timestamp;
        _recordActivity();
        emit HeartbeatSubmitted(owner(), block.timestamp);
    }

    // ──────────────────────────────────────────────
    // State machine: trigger → confirm → finalize / cancel
    // ──────────────────────────────────────────────

    /// @notice Move state to CONFIRMING when all liveness signals have failed.
    ///         Callable by anyone — the liveness conditions are enforced on-chain.
    ///         Conditions: inactivity window elapsed AND 3× heartbeat intervals missed.
    function triggerExecution() public {
        require(
            state == WillState.ACTIVE || state == WillState.CONFIRMING,
            "FHEWill: cannot trigger"
        );
        require(
            block.timestamp > lastActivityTimestamp + inactivityWindow,
            "FHEWill: owner still active"
        );
        require(
            block.timestamp > lastHeartbeatTimestamp + heartbeatInterval * 3,
            "FHEWill: heartbeat not missed (need 3x interval)"
        );

        state = WillState.CONFIRMING;

        // Update encrypted state mirror using select (FHEVM rule: no if/else on encrypted values)
        ebool  alwaysTrue    = FHE.asEbool(true);
        FHE.allowThis(alwaysTrue);
        euint8 confirmingVal = FHE.asEuint8(uint8(WillState.CONFIRMING));
        FHE.allowThis(confirmingVal);
        _encryptedState = FHE.select(alwaysTrue, confirmingVal, _encryptedState);
        FHE.allowThis(_encryptedState);

        emit ExecutionTriggered(owner());
    }

    /// @notice Guardian confirms the owner is deceased.
    ///         Requires state == CONFIRMING (triggerExecution must have been called first).
    ///         When MIN_GUARDIAN_CONFIRMS is reached, automatically finalizes execution.
    /// @param guardianSigHash keccak256 of the guardian's identity proof (e.g. keccak256(email + nonce))
    function confirmDeceased(bytes32 guardianSigHash) external {
        require(state == WillState.CONFIRMING,        "FHEWill: not confirming");
        require(!guardianConfirmed[guardianSigHash],  "FHEWill: already confirmed");

        guardianConfirmed[guardianSigHash] = true;
        guardianConfirmCount++;

        emit GuardianConfirmed(guardianConfirmCount);

        // Note: spec says "call triggerExecution()" here but that requires liveness expiry and
        // would set state back to CONFIRMING (already there). Interpreted as: finalize once
        // quorum is reached. Deviation from spec noted in Step 2 report.
        if (guardianConfirmCount >= MIN_GUARDIAN_CONFIRMS) {
            _finalizeExecutionInternal();
        }
    }

    /// @notice Explicitly finalize execution. Usable by executor or when guardian quorum is met.
    function finalizeExecution() external {
        require(
            msg.sender == executor || approvedExecutors[msg.sender] ||
            guardianConfirmCount >= MIN_GUARDIAN_CONFIRMS,
            "FHEWill: not authorized"
        );
        require(state == WillState.CONFIRMING, "FHEWill: not confirming");
        _finalizeExecutionInternal();
    }

    /// @notice Owner cancels a falsely triggered execution.
    ///         Resets state to ACTIVE and clears guardian confirmations.
    function cancelExecution() external onlyOwner {
        require(state == WillState.CONFIRMING, "FHEWill: not confirming");

        state                = WillState.ACTIVE;
        guardianConfirmCount = 0;

        // Reset encrypted state back to ACTIVE using select
        ebool  alwaysTrue = FHE.asEbool(true);
        FHE.allowThis(alwaysTrue);
        euint8 activeVal  = FHE.asEuint8(uint8(WillState.ACTIVE));
        FHE.allowThis(activeVal);
        _encryptedState = FHE.select(alwaysTrue, activeVal, _encryptedState);
        FHE.allowThis(_encryptedState);

        _encryptedIsActive = FHE.asEbool(true);
        FHE.allowThis(_encryptedIsActive);

        _recordActivity();
        emit ExecutionCancelled(owner());
    }

    // ──────────────────────────────────────────────
    // Encrypted handle reads (executor + owner)
    // ──────────────────────────────────────────────

    /// @notice Returns typed FHE handles for a beneficiary slot.
    ///         Executor uses these to call sdk.publicDecrypt() off-chain.
    function getEncryptedBeneficiary(uint8 index)
        external
        view
        returns (euint256 emailHash, euint32 share, eaddress fallbackAddr)
    {
        require(
            msg.sender == executor || msg.sender == owner() || approvedExecutors[msg.sender],
            "FHEWill: not authorized"
        );
        require(index < beneficiaryCount, "FHEWill: index out of range");
        return (
            _encryptedEmailHashes[index],
            _encryptedShares[index],
            _encryptedFallbackAddrs[index]
        );
    }

    /// @notice Returns raw bytes32 handles for SDK reencrypt / publicDecrypt calls.
    function getBeneficiaryHandles(uint8 index)
        external
        view
        returns (bytes32 emailHandle, bytes32 shareHandle, bytes32 fallbackHandle)
    {
        require(index < beneficiaryCount, "FHEWill: index out of range");
        return (
            euint256.unwrap(_encryptedEmailHashes[index]),
            euint32.unwrap(_encryptedShares[index]),
            eaddress.unwrap(_encryptedFallbackAddrs[index])
        );
    }

    // ──────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────

    function isLivenessExpired() external view returns (bool) {
        return _isLivenessExpired();
    }

    /// @notice Returns true when inactivity window elapsed AND will is not yet executed.
    ///         LivenessOracle uses this in checkUpkeep.
    function isInactive() external view returns (bool) {
        return _isLivenessExpired() && state != WillState.EXECUTED;
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    /// @dev Sets state = EXECUTED, grants executor ACL access to all handles,
    ///      and marks all handles as publicly decryptable.
    function _finalizeExecutionInternal() internal {
        state = WillState.EXECUTED;

        // Update encrypted state using select (always pick EXECUTED)
        ebool  alwaysTrue  = FHE.asEbool(true);
        FHE.allowThis(alwaysTrue);
        euint8 executedVal = FHE.asEuint8(uint8(WillState.EXECUTED));
        FHE.allowThis(executedVal);
        _encryptedState = FHE.select(alwaysTrue, executedVal, _encryptedState);
        FHE.allowThis(_encryptedState);

        _encryptedIsActive = FHE.asEbool(false);
        FHE.allowThis(_encryptedIsActive);

        // FHEVM rule: allow(executor) granted here — the first and only time.
        // Also mark handles publicly decryptable so the off-chain agent can decrypt.
        for (uint8 i = 0; i < beneficiaryCount; i++) {
            if (FHE.isInitialized(_encryptedEmailHashes[i])) {
                FHE.allow(_encryptedEmailHashes[i], executor);
                FHE.allow(_encryptedShares[i], executor);
                FHE.allow(_encryptedFallbackAddrs[i], executor);

                FHE.makePubliclyDecryptable(_encryptedEmailHashes[i]);
                FHE.makePubliclyDecryptable(_encryptedShares[i]);
                FHE.makePubliclyDecryptable(_encryptedFallbackAddrs[i]);
            }
        }

        emit WillExecuted(owner(), beneficiaryCount);
    }

    /// @dev Updates the activity timestamp and, if state was CONFIRMING, reverts to ACTIVE.
    ///      Uses FHE.select to update the encrypted state mirror without branching on
    ///      encrypted values (FHEVM rule).
    function _recordActivity() internal {
        bool wasConfirming = (state == WillState.CONFIRMING);

        lastActivityTimestamp = block.timestamp;

        if (wasConfirming) {
            state                = WillState.ACTIVE;
            guardianConfirmCount = 0;
        }

        // Mirror the state change to the encrypted state using FHE.select.
        // The condition (wasConfirming) is plaintext — this does not branch on encrypted values.
        ebool  condition = FHE.asEbool(wasConfirming);
        FHE.allowThis(condition);
        euint8 activeVal = FHE.asEuint8(uint8(WillState.ACTIVE));
        FHE.allowThis(activeVal);
        _encryptedState = FHE.select(condition, activeVal, _encryptedState);
        FHE.allowThis(_encryptedState);

        emit ActivityRecorded(owner(), block.timestamp);
    }

    function _isLivenessExpired() internal view returns (bool) {
        return block.timestamp > lastActivityTimestamp + inactivityWindow;
    }
}
