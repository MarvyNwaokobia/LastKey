// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title BeneficiaryVault — Holds ETH and ERC-20 tokens for a beneficiary.
/// @notice Deployed by WillExecutor for beneficiaries who have no wallet yet
///         (email-only claimants). Once the beneficiary proves their identity
///         off-chain, the vault owner is transferred to their wallet.
///
/// The executor deploys this vault deterministically via CREATE2 so the address
/// can be computed and funded before the beneficiary claims.
contract BeneficiaryVault {

    address public owner;

    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address _owner) {
        require(_owner != address(0), "BeneficiaryVault: zero owner");
        owner = _owner;
    }

    receive() external payable {}

    modifier onlyOwner() {
        require(msg.sender == owner, "BeneficiaryVault: not owner");
        _;
    }

    /// @notice Withdraw ETH (token == address(0)) or ERC-20 to any address.
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "BeneficiaryVault: zero recipient");
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "BeneficiaryVault: ETH transfer failed");
        } else {
            IERC20(token).transfer(to, amount);
        }
        emit Withdrawn(token, to, amount);
    }

    /// @notice Beneficiary calls this once they have a wallet to control the vault.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BeneficiaryVault: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
