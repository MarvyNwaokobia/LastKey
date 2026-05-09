// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FhevmTest }       from "forge-fhevm/FhevmTest.sol";
import { InputProofHelper } from "forge-fhevm/InputProofHelper.sol";
import { FheType }          from "@fhevm/host-contracts/contracts/shared/FheType.sol";
import { WillExecutor }     from "../src/WillExecutor.sol";
import { WillFactory }      from "../src/WillFactory.sol";
import { FHEWill }          from "../src/FHEWill.sol";
import { IFHEWill }         from "../src/interfaces/IFHEWill.sol";
import { BeneficiaryVault } from "../src/BeneficiaryVault.sol";
import { MockERC20 }        from "./mock/MockERC20.sol";
import { inputVerifierAdd, aclAdd } from "@fhevm/host-contracts/addresses/FHEVMHostAddresses.sol";

contract WillExecutorTest is FhevmTest {

    WillExecutor internal executor;
    WillFactory  internal factory;
    FHEWill      internal will;
    MockERC20    internal token;

    address internal admin       = makeAddr("admin");
    address internal willOwner   = makeAddr("willOwner");
    address internal beneficiary = makeAddr("beneficiary");

    uint256 private _batchNonce;

    function setUp() public override {
        super.setUp();

        vm.startPrank(admin);
        executor = new WillExecutor(admin);
        factory  = new WillFactory(address(executor));
        executor.setFactory(address(factory));
        vm.stopPrank();

        vm.prank(willOwner);
        will = FHEWill(factory.createWill(address(executor)));

        token = new MockERC20("TestToken", "TT");
        token.mint(willOwner, 10_000 ether);

        vm.prank(willOwner);
        token.approve(address(executor), type(uint256).max);
    }

    // ── owner / factory ───────────────────────────────────────────────────────

    function test_owner_isAdmin() public view {
        assertEq(executor.owner(), admin);
    }

    function test_factory_setCorrectly() public view {
        assertEq(executor.factory(), address(factory));
    }

    function test_setFactory_revertsIfCalledTwice() public {
        vm.prank(admin);
        vm.expectRevert("WillExecutor: factory already set");
        executor.setFactory(makeAddr("x"));
    }

    // ── execute ───────────────────────────────────────────────────────────────

    function test_execute_revertsIfWillNotFinalized() public {
        vm.expectRevert("WillExecutor: will not finalized");
        executor.execute(address(will));
    }

    function test_execute_revertsForInvalidWill() public {
        vm.expectRevert("WillExecutor: not a valid will");
        executor.execute(makeAddr("spoofed"));
    }

    function test_execute_marksWillAsExecuted() public {
        _reachExecuted();
        executor.execute(address(will));
        assertTrue(executor.executedWills(address(will)));
    }

    function test_execute_revertsIfCalledTwice() public {
        _reachExecuted();
        executor.execute(address(will));
        vm.expectRevert("WillExecutor: already executed");
        executor.execute(address(will));
    }

    // ── resolveTransfer ───────────────────────────────────────────────────────

    function test_resolveTransfer_transfersTokensProportionally() public {
        _addBeneficiary(willOwner, 5000, beneficiary); // 50%
        _reachExecuted();
        executor.execute(address(will));

        address[] memory tokens  = new address[](1);
        tokens[0]                = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0]               = 10_000 ether;

        vm.prank(admin);
        executor.resolveTransfer(
            address(will), willOwner, 0, 5000, beneficiary, tokens, amounts
        );

        assertEq(token.balanceOf(beneficiary), 5_000 ether); // 50% of 10,000
    }

    function test_resolveTransfer_revertsIfNotAuthorized() public {
        _reachExecuted();
        executor.execute(address(will));

        vm.prank(makeAddr("rando"));
        vm.expectRevert("WillExecutor: not authorized");
        executor.resolveTransfer(
            address(will), willOwner, 0, 5000, beneficiary,
            new address[](0), new uint256[](0)
        );
    }

    function test_resolveTransfer_revertsIfNotExecuted() public {
        vm.prank(admin);
        vm.expectRevert("WillExecutor: not executed");
        executor.resolveTransfer(
            address(will), willOwner, 0, 5000, beneficiary,
            new address[](0), new uint256[](0)
        );
    }

    function test_resolveTransfer_revertsIfSlotAlreadyResolved() public {
        _addBeneficiary(willOwner, 10000, beneficiary);
        _reachExecuted();
        executor.execute(address(will));

        address[] memory tokens  = new address[](0);
        uint256[] memory amounts = new uint256[](0);

        vm.prank(admin);
        executor.resolveTransfer(address(will), willOwner, 0, 10000, beneficiary, tokens, amounts);

        vm.prank(admin);
        vm.expectRevert("WillExecutor: slot already resolved");
        executor.resolveTransfer(address(will), willOwner, 0, 10000, beneficiary, tokens, amounts);
    }

    function test_resolveTransfer_zeroAmountSkipped() public {
        _addBeneficiary(willOwner, 5000, beneficiary); // needs at least 1 slot
        _reachExecuted();
        executor.execute(address(will));

        address[] memory tokens  = new address[](1);
        tokens[0]                = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0]               = 0; // zero total → no transfer

        vm.prank(admin);
        executor.resolveTransfer(address(will), willOwner, 0, 5000, beneficiary, tokens, amounts);

        assertEq(token.balanceOf(beneficiary), 0);
    }

    // ── computeBeneficiaryAddress ─────────────────────────────────────────────

    function test_computeBeneficiaryAddress_deterministicAndMatchesDeploy() public {
        bytes32 emailHash = keccak256("alice@example.com");

        address predicted = executor.computeBeneficiaryAddress(emailHash, willOwner, beneficiary);
        vm.prank(admin);
        address deployed  = executor.deployBeneficiaryVault(emailHash, willOwner, beneficiary);

        assertEq(predicted, deployed);
    }

    function test_deployedVault_ownerIsBeneficiary() public {
        bytes32 emailHash = keccak256("alice@example.com");
        vm.prank(admin);
        address vaultAddr = executor.deployBeneficiaryVault(emailHash, willOwner, beneficiary);
        assertEq(BeneficiaryVault(payable(vaultAddr)).owner(), beneficiary);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _reachExecuted() internal {
        vm.warp(block.timestamp + 366 days);
        will.triggerExecution();
        will.confirmDeceased(keccak256("g1@x.com"));
        will.confirmDeceased(keccak256("g2@x.com")); // quorum -> EXECUTED
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.EXECUTED));
    }

    function _addBeneficiary(address user, uint32 share, address fallbackWallet) internal {
        uint256 emailHash = uint256(keccak256(abi.encodePacked(fallbackWallet)));
        address target    = address(will);

        bytes memory blob = abi.encodePacked(
            keccak256(abi.encodePacked("lastkey.batch", ++_batchNonce, user, target))
        );

        bytes32 h0 = InputProofHelper.computeInputHandle(blob, 0, FheType.Uint256, aclAdd, uint64(block.chainid));
        bytes32 h1 = InputProofHelper.computeInputHandle(blob, 1, FheType.Uint32,  aclAdd, uint64(block.chainid));
        bytes32 h2 = InputProofHelper.computeInputHandle(blob, 2, FheType.Uint160, aclAdd, uint64(block.chainid));

        _plaintexts[h0] = emailHash;
        _plaintexts[h1] = uint256(share);
        _plaintexts[h2] = uint256(uint160(fallbackWallet));

        bytes32[] memory handles = new bytes32[](3);
        handles[0] = h0; handles[1] = h1; handles[2] = h2;

        bytes32 domainSep = InputProofHelper.computeInputVerifierDomainSeparator(inputVerifierAdd, block.chainid);
        bytes32 digest    = InputProofHelper.computeInputVerificationDigest(handles, user, target, block.chainid, EMPTY_EXTRA_DATA, domainSep);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signDigest(MOCK_INPUT_SIGNER_PK, digest);

        vm.prank(user);
        will.addBeneficiary(h0, h1, h2, InputProofHelper.assembleInputProof(handles, sigs, EMPTY_EXTRA_DATA));
    }
}
