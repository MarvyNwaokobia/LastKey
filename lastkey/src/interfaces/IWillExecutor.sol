// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IWillExecutor — Interface for the two-phase stateless will executor
interface IWillExecutor {

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when Phase 1 completes. Off-chain agent watches this to
    ///         know which will handles are ready for publicDecrypt.
    event ExecutionStarted(
        address indexed willContract,
        uint8           beneficiaryCount,
        address indexed willOwner
    );

    /// @notice Emitted per beneficiary handle so the agent knows exactly which
    ///         bytes32 handles to pass to sdk.publicDecrypt().
    event BeneficiaryHandleEmitted(
        address indexed willContract,
        uint8           index,
        bytes32         emailHandle,
        bytes32         shareHandle,
        bytes32         fallbackHandle
    );

    /// @notice Emitted after a beneficiary's token transfer is resolved (Phase 2).
    event TransferResolved(
        address indexed willContract,
        uint8           index,
        address indexed beneficiaryAddr,
        uint32          sharePercent
    );

    /// @notice Emitted when ACL handles are revoked after all slots are resolved.
    event ACLRevoked(address indexed willContract);

    // ──────────────────────────────────────────────
    // Functions
    // ──────────────────────────────────────────────

    function owner()   external view returns (address);
    function factory() external view returns (address);

    /// @notice Phase 1: validate will, mark as processing, emit handles for agent.
    function execute(address willContract) external;

    /// @notice Phase 2: called by authorized relayer with plaintext beneficiary data.
    ///         Computes each token amount proportional to sharePercent (basis points),
    ///         then calls ERC-20 transferFrom(willOwner, beneficiaryAddr, amount).
    function resolveTransfer(
        address          willContract,
        address          willOwner,
        uint8            index,
        uint32           sharePercent,
        address          beneficiaryAddr,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts
    ) external;

    function computeBeneficiaryAddress(bytes32 emailHash, address willOwner, address beneficiary)
        external view returns (address);

    function setFactory(address _factory) external;
}
