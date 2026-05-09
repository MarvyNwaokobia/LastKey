// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IWillFactory — Interface used by WillExecutor and LivenessOracle
///         to verify that a will was legitimately deployed by this factory.
interface IWillFactory {
    event WillCreated(address indexed owner, address indexed willAddress);

    function createWill(address executorAddress) external returns (address willAddress);
    function getWill(address owner)              external view returns (address);
    function hasWill(address owner)              external view returns (bool);

    /// @notice Returns true only for will contracts deployed by this factory.
    ///         WillExecutor calls this to reject calls on arbitrary contracts.
    function isValidWill(address willContract)   external view returns (bool);
    function predictWillAddress(address owner)   external view returns (address);
}
