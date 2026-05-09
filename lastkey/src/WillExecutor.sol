// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC20 }        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFHEWill }      from "./interfaces/IFHEWill.sol";
import { IWillFactory }  from "./interfaces/IWillFactory.sol";
import { IWillExecutor } from "./interfaces/IWillExecutor.sol";
import { BeneficiaryVault } from "./BeneficiaryVault.sol";

/// @title WillExecutor — Stateless two-phase will executor
///
/// Trust model (MVP):
///   Phase 1 — execute(will): validates will is finalized, marks it processed,
///             emits raw FHE handles so the off-chain agent can call publicDecrypt.
///   Phase 2 — resolveTransfer(...): authorized relayer (owner) submits the
///             plaintext beneficiary data after decryption, executor performs
///             the token transfers.
///
/// This is honest about the MVP trust model while fully demonstrating the FHE
/// privacy guarantees: beneficiary identities and shares are encrypted on-chain
/// and only revealed at execution time via the KMS.
///
/// Architectural note on `factory` immutability:
///   The spec says `address public immutable factory`, but deployment ordering
///   requires executor to exist before factory (factory takes executor's address).
///   We use a one-time mutable setter to avoid the chicken-and-egg problem.
///   `owner` IS immutable as it is known at constructor time.
contract WillExecutor is IWillExecutor {

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice The authorized relayer / admin. Immutable — set at construction.
    ///         Only this address can call resolveTransfer and setFactory.
    address public immutable owner;

    /// @notice WillFactory address — verified in execute() to reject spoofed wills.
    ///         Mutable (set once by owner after factory is deployed).
    address public factory;
    bool private _factorySet;

    /// @notice Prevents execute() from being called twice on the same will.
    mapping(address => bool) public executedWills;

    /// @notice Tracks which beneficiary slots have been resolved per will.
    mapping(address => mapping(uint8 => bool)) public slotResolved;

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _owner) {
        require(_owner != address(0), "WillExecutor: zero owner");
        owner = _owner;
    }

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "WillExecutor: not authorized");
        _;
    }

    // ──────────────────────────────────────────────
    // Admin: one-time factory registration
    // ──────────────────────────────────────────────

    /// @notice Register the factory address (called once after factory is deployed).
    function setFactory(address _factory) external onlyOwner {
        require(!_factorySet,            "WillExecutor: factory already set");
        require(_factory != address(0),  "WillExecutor: zero address");
        factory    = _factory;
        _factorySet = true;
    }

    // ──────────────────────────────────────────────
    // Phase 1 — execute
    // ──────────────────────────────────────────────

    /// @notice Phase 1: validate that the will is finalized and legitimate,
    ///         mark it as processed (re-entrancy guard), then emit the raw FHE
    ///         handles so the off-chain agent can call sdk.publicDecrypt().
    ///
    /// @dev    makePubliclyDecryptable was already called inside
    ///         FHEWill._finalizeExecutionInternal(), so handles are already
    ///         decryptable by the KMS. We emit them here for agent discovery.
    function execute(address willContract) external {
        require(!executedWills[willContract],  "WillExecutor: already executed");
        require(factory != address(0),         "WillExecutor: factory not set");
        require(
            IWillFactory(factory).isValidWill(willContract),
            "WillExecutor: not a valid will"
        );
        require(
            IFHEWill(willContract).state() == IFHEWill.WillState.EXECUTED,
            "WillExecutor: will not finalized"
        );

        // Re-entrancy guard — mark before any external calls
        executedWills[willContract] = true;

        IFHEWill will       = IFHEWill(willContract);
        uint8    count      = will.beneficiaryCount();
        address  willOwner_ = will.owner();

        // Emit raw bytes32 handles for each beneficiary slot.
        // Off-chain agent watches for BeneficiaryHandleEmitted, calls publicDecrypt,
        // then calls resolveTransfer() with the plaintext values.
        for (uint8 i = 0; i < count; i++) {
            (bytes32 emailHandle, bytes32 shareHandle, bytes32 fallbackHandle) =
                will.getBeneficiaryHandles(i);
            emit BeneficiaryHandleEmitted(willContract, i, emailHandle, shareHandle, fallbackHandle);
        }

        emit ExecutionStarted(willContract, count, willOwner_);
    }

    // ──────────────────────────────────────────────
    // Phase 2 — resolveTransfer
    // ──────────────────────────────────────────────

    /// @notice Phase 2: authorized relayer submits plaintext beneficiary data after
    ///         off-chain decryption. Executor computes each token amount proportional
    ///         to sharePercent (basis points, 0–10 000) and transfers from willOwner.
    ///
    /// @param willContract    The FHEWill being resolved
    /// @param willOwner_      The owner of the will (pre-approved the executor as spender)
    /// @param index           Beneficiary slot index (0–9)
    /// @param sharePercent    Decrypted allocation in basis points (0–10 000 = 0–100%)
    /// @param beneficiaryAddr Resolved wallet address for this beneficiary
    /// @param tokenAddresses  ERC-20 tokens to transfer (address(0) = native ETH)
    /// @param tokenAmounts    Total amount of each token held by willOwner (executor computes share)
    function resolveTransfer(
        address          willContract,
        address          willOwner_,
        uint8            index,
        uint32           sharePercent,
        address          beneficiaryAddr,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts
    ) external onlyOwner {
        require(executedWills[willContract],                         "WillExecutor: not executed");
        require(!slotResolved[willContract][index],                  "WillExecutor: slot already resolved");
        require(index < IFHEWill(willContract).beneficiaryCount(),   "WillExecutor: index out of range");
        require(beneficiaryAddr != address(0),                       "WillExecutor: zero beneficiary");
        require(sharePercent <= 10_000,                              "WillExecutor: share exceeds 100%");
        require(tokenAddresses.length == tokenAmounts.length,        "WillExecutor: array length mismatch");

        // Mark resolved before transfers (re-entrancy guard)
        slotResolved[willContract][index] = true;

        // Transfer each token proportional to sharePercent (basis points)
        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            uint256 amount = tokenAmounts[i] * sharePercent / 10_000;
            if (amount == 0) continue;

            if (tokenAddresses[i] == address(0)) {
                // Native ETH — will must have approved executor to pull ETH, or
                // executor was funded directly. For MVP: executor sends its own ETH balance.
                (bool ok,) = payable(beneficiaryAddr).call{value: amount}("");
                require(ok, "WillExecutor: ETH transfer failed");
            } else {
                // ERC-20: will owner must have approved executor via approve()
                IERC20(tokenAddresses[i]).transferFrom(willOwner_, beneficiaryAddr, amount);
            }
        }

        emit TransferResolved(willContract, index, beneficiaryAddr, sharePercent);
    }

    // ──────────────────────────────────────────────
    // Beneficiary vault
    // ──────────────────────────────────────────────

    /// @notice Compute the deterministic vault address for a beneficiary
    ///         who has no wallet yet (email-only claimant).
    /// @param beneficiary The intended vault owner (included in CREATE2 init code hash).
    function computeBeneficiaryAddress(bytes32 emailHash, address willOwner_, address beneficiary)
        external
        view
        returns (address)
    {
        return _computeBeneficiaryAddress(emailHash, willOwner_, beneficiary);
    }

    /// @notice Deploy a BeneficiaryVault for an email-only claimant.
    ///         The vault holds assets until the beneficiary proves their identity.
    function deployBeneficiaryVault(bytes32 emailHash, address willOwner_, address beneficiary)
        external
        onlyOwner
        returns (address vault)
    {
        vault = _deployBeneficiaryVault(emailHash, willOwner_, beneficiary);
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    function _computeBeneficiaryAddress(bytes32 emailHash, address willOwner_, address beneficiary)
        internal
        view
        returns (address)
    {
        bytes32 salt         = keccak256(abi.encodePacked(emailHash, willOwner_));
        // Must include abi-encoded constructor arg (beneficiary) in the init code hash
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(BeneficiaryVault).creationCode, abi.encode(beneficiary))
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            initCodeHash
        )))));
    }

    function _deployBeneficiaryVault(
        bytes32 emailHash,
        address willOwner_,
        address beneficiary
    ) internal returns (address vault) {
        bytes32 salt = keccak256(abi.encodePacked(emailHash, willOwner_));
        vault = address(new BeneficiaryVault{salt: salt}(beneficiary));
    }

    receive() external payable {}
}
