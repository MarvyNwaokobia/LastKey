// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Ownable }      from "@openzeppelin/contracts/access/Ownable.sol";
import { IFHEWill }     from "./interfaces/IFHEWill.sol";
import { IWillFactory } from "./interfaces/IWillFactory.sol";

// @title LivenessOracle - Chainlink Automation keeper for LastKey liveness monitoring
//
// Monitors registered FHEWill contracts for inactivity. When a will's
// inactivity window elapses, the keeper calls triggerExecution() to move
// the will into CONFIRMING state, allowing guardians to confirm and finalize.
//
// Chainlink Automation interface is inlined to avoid forge dependency.
// Replace with the official chainlink/contracts import before mainnet deployment.
contract LivenessOracle is Ownable {

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice WillFactory — used to verify wills are legitimate before registering.
    address public immutable factory;

    /// @notice WillExecutor — stored for future use (e.g. notifying executor of triggers).
    address public immutable executor;

    /// @notice Minimum interval between upkeep checks per will.
    uint256 public checkInterval = 1 days;

    address[]                    public registeredWills;
    mapping(address => bool)     public isRegistered;
    mapping(address => uint256)  public lastChecked;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event WillRegistered(address indexed willContract, address indexed willOwner);
    event WillDeregistered(address indexed willContract);
    event UpkeepPerformed(address indexed willContract);

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _factory, address _executor) Ownable(msg.sender) {
        require(_factory  != address(0), "LivenessOracle: zero factory");
        require(_executor != address(0), "LivenessOracle: zero executor");
        factory  = _factory;
        executor = _executor;
    }

    // ──────────────────────────────────────────────
    // Registration
    // ──────────────────────────────────────────────

    /// @notice Register a FHEWill for liveness monitoring.
    ///         Verifies the will was deployed by the factory (prevents spoofing).
    function registerWill(address willContract) external {
        require(willContract != address(0),                                "LivenessOracle: zero address");
        require(!isRegistered[willContract],                               "LivenessOracle: already registered");
        require(IWillFactory(factory).isValidWill(willContract),           "LivenessOracle: not a factory will");
        require(
            IFHEWill(willContract).state() == IFHEWill.WillState.ACTIVE,
            "LivenessOracle: will not active"
        );

        isRegistered[willContract] = true;
        lastChecked[willContract]  = block.timestamp;
        registeredWills.push(willContract);

        emit WillRegistered(willContract, IFHEWill(willContract).owner());
    }

    /// @notice Deregister a will (e.g. after execution completes).
    function deregisterWill(address willContract) external {
        require(isRegistered[willContract], "LivenessOracle: not registered");
        // Allow owner or the will owner to deregister
        require(
            msg.sender == owner() || msg.sender == IFHEWill(willContract).owner(),
            "LivenessOracle: not authorized"
        );
        isRegistered[willContract] = false;
        emit WillDeregistered(willContract);
    }

    // ──────────────────────────────────────────────
    // Chainlink Automation
    // ──────────────────────────────────────────────

    /// @notice Chainlink Automation calls this off-chain to check whether work is needed.
    ///         Returns (true, abi.encode(willAddress)) for the first inactive ACTIVE will.
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData)
    {
        for (uint256 i = 0; i < registeredWills.length; i++) {
            address willAddr = registeredWills[i];
            if (!isRegistered[willAddr]) continue;
            if (block.timestamp < lastChecked[willAddr] + checkInterval) continue;

            IFHEWill will = IFHEWill(willAddr);
            if (_shouldTrigger(will)) {
                return (true, abi.encode(willAddr));
            }
        }
        return (false, "");
    }

    /// @notice Chainlink Automation calls this on-chain when checkUpkeep returns true.
    ///         Calls triggerExecution() on the inactive will to move it to CONFIRMING.
    function performUpkeep(bytes calldata performData) external {
        address willAddr = abi.decode(performData, (address));

        require(isRegistered[willAddr], "LivenessOracle: not registered");

        IFHEWill will = IFHEWill(willAddr);
        require(_shouldTrigger(will), "LivenessOracle: conditions not met");

        lastChecked[willAddr] = block.timestamp;
        will.triggerExecution();

        emit UpkeepPerformed(willAddr);
    }

    // ──────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────

    function registeredWillsCount() external view returns (uint256) {
        return registeredWills.length;
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    function setCheckInterval(uint256 interval) external onlyOwner {
        require(interval >= 1 hours, "LivenessOracle: interval too short");
        checkInterval = interval;
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    /// @dev Returns true when the will is inactive (inactivity window elapsed)
    ///      AND in ACTIVE state (triggerExecution would succeed).
    ///      Also checks the 3x heartbeat condition to avoid a revert in performUpkeep.
    function _shouldTrigger(IFHEWill will) internal view returns (bool) {
        if (will.state() != IFHEWill.WillState.ACTIVE) return false;
        if (!will.isInactive()) return false;
        // Heartbeat must also be missed (matches triggerExecution's require)
        return block.timestamp > will.lastHeartbeatTimestamp() + will.heartbeatInterval() * 3;
    }
}
