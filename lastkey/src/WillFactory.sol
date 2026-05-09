// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Ownable }      from "@openzeppelin/contracts/access/Ownable.sol";
import { FHEWill }      from "./FHEWill.sol";
import { IWillFactory } from "./interfaces/IWillFactory.sol";

/// @title WillFactory — Deploys one FHEWill per owner via CREATE2.
/// @notice The factory is the single source of truth for legitimate will contracts.
///         WillExecutor and LivenessOracle call isValidWill() to reject arbitrary
///         contract addresses passed as arguments.
contract WillFactory is Ownable, IWillFactory {

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Default executor used when createWill(address(0)) is called.
    address public executor;

    /// @notice owner → deployed will address
    mapping(address => address) private _wills;

    /// @notice Reverse lookup: will address → was it deployed by this factory?
    mapping(address => bool) private _validWills;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _executor) Ownable(msg.sender) {
        require(_executor != address(0), "WillFactory: zero executor");
        executor = _executor;
    }

    // ──────────────────────────────────────────────
    // Core: deploy a will
    // ──────────────────────────────────────────────

    /// @notice Deploy a new FHEWill for msg.sender via CREATE2.
    /// @param executorAddress The WillExecutor this will trusts.
    ///                        Pass address(0) to use the factory's default executor.
    /// @return willAddress    The deterministic address of the new FHEWill.
    function createWill(address executorAddress) external returns (address willAddress) {
        require(_wills[msg.sender] == address(0), "WillFactory: will already exists");

        address exec = executorAddress != address(0) ? executorAddress : executor;
        require(exec != address(0), "WillFactory: no executor");

        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        willAddress  = _deployWill(salt, msg.sender, exec);

        _wills[msg.sender]     = willAddress;
        _validWills[willAddress] = true;

        emit WillCreated(msg.sender, willAddress);
    }

    // ──────────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────────

    /// @notice Returns the will address for a given owner (address(0) if none).
    function getWill(address owner_) external view returns (address) {
        return _wills[owner_];
    }

    /// @notice Returns true if the owner has a deployed will.
    function hasWill(address owner_) external view returns (bool) {
        return _wills[owner_] != address(0);
    }

    /// @notice Returns true ONLY for wills deployed by this factory.
    ///         Called by WillExecutor.execute() and LivenessOracle.registerWill()
    ///         to prevent spoofed or arbitrary contracts being passed in.
    function isValidWill(address willContract) external view returns (bool) {
        return _validWills[willContract];
    }

    /// @notice Predict the will address for a given owner (using default executor).
    ///         Useful for frontend pre-computation before deployment.
    function predictWillAddress(address owner_) external view returns (address) {
        bytes32 salt         = keccak256(abi.encodePacked(owner_));
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(FHEWill).creationCode,
                abi.encode(owner_, address(this), executor)
            )
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            bytecodeHash
        )))));
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    /// @notice Update the default executor. Does not affect existing wills.
    function setExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "WillFactory: zero executor");
        emit ExecutorUpdated(executor, newExecutor);
        executor = newExecutor;
    }

    // ──────────────────────────────────────────────
    // Internal: CREATE2 deploy
    // ──────────────────────────────────────────────

    function _deployWill(
        bytes32 salt,
        address willOwner,
        address willExecutor
    ) internal returns (address deployed) {
        bytes memory bytecode = abi.encodePacked(
            type(FHEWill).creationCode,
            abi.encode(willOwner, address(this), willExecutor)
        );
        assembly {
            deployed := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(deployed)) { revert(0, 0) }
        }
    }
}
