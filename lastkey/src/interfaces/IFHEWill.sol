// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { euint32, euint256, eaddress } from "encrypted-types/EncryptedTypes.sol";

/// @title IFHEWill — Interface for the per-owner confidential will contract
interface IFHEWill {

    // ──────────────────────────────────────────────
    // Enums
    // ──────────────────────────────────────────────

    enum WillState { ACTIVE, CONFIRMING, EXECUTED }

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event WillActivated(address indexed owner);
    event BeneficiaryAdded(uint8 indexed index);
    event GuardianAdded(uint8 guardianCount);
    event ActivityRecorded(address indexed owner, uint256 timestamp);
    event HeartbeatSubmitted(address indexed owner, uint256 timestamp);
    event GuardianConfirmed(uint8 guardianConfirmCount);
    event ExecutionTriggered(address indexed owner);
    event ExecutionCancelled(address indexed owner);
    event WillExecuted(address indexed owner, uint8 beneficiaryCount);

    // ──────────────────────────────────────────────
    // State readers
    // ──────────────────────────────────────────────

    function owner()                     external view returns (address);
    function factory()                   external view returns (address);
    function executor()                  external view returns (address);
    function inactivityWindow()          external view returns (uint256);
    function lastActivityTimestamp()     external view returns (uint256);
    function lastHeartbeatTimestamp()    external view returns (uint256);
    function heartbeatInterval()         external view returns (uint256);
    function beneficiaryCount()          external view returns (uint8);
    function guardianCount()             external view returns (uint8);
    function guardianConfirmCount()      external view returns (uint8);
    function state()                     external view returns (WillState);
    function approvedExecutors(address)  external view returns (bool);
    function guardianConfirmed(bytes32)  external view returns (bool);
    function isLivenessExpired()         external view returns (bool);

    /// @notice Returns true when the inactivity window has elapsed AND the will is not yet executed.
    ///         LivenessOracle calls this in checkUpkeep to decide whether to trigger.
    function isInactive()                external view returns (bool);

    // ──────────────────────────────────────────────
    // Encrypted handle reads (for executor / SDK)
    // ──────────────────────────────────────────────

    function getEncryptedBeneficiary(uint8 index)
        external view returns (euint256 emailHash, euint32 share, eaddress fallbackAddr);

    function getBeneficiaryHandles(uint8 index)
        external view returns (bytes32 emailHandle, bytes32 shareHandle, bytes32 fallbackHandle);

    // ──────────────────────────────────────────────
    // Write functions
    // ──────────────────────────────────────────────

    function addBeneficiary(
        bytes32        encryptedEmailHash,
        bytes32        encryptedShare,
        bytes32        encryptedFallback,
        bytes calldata inputProof
    ) external;

    function addGuardian(
        bytes32        encryptedGuardianHash,
        bytes calldata inputProof
    ) external;

    function setInactivityWindow(uint256 newWindow)               external;
    function recordActivity()                                     external;
    function submitHeartbeat(bytes calldata passkeyAttestation)   external;
    function confirmDeceased(bytes32 guardianSigHash)             external;
    function triggerExecution()                                   external;
    function finalizeExecution()                                  external;
    function cancelExecution()                                    external;
}
