// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FhevmTest }       from "forge-fhevm/FhevmTest.sol";
import { InputProofHelper } from "forge-fhevm/InputProofHelper.sol";
import { FheType }          from "@fhevm/host-contracts/contracts/shared/FheType.sol";
import { LivenessOracle }   from "../src/LivenessOracle.sol";
import { WillExecutor }     from "../src/WillExecutor.sol";
import { WillFactory }      from "../src/WillFactory.sol";
import { FHEWill }          from "../src/FHEWill.sol";
import { IFHEWill }         from "../src/interfaces/IFHEWill.sol";
import { MockERC20 }        from "./mock/MockERC20.sol";
import { inputVerifierAdd, aclAdd } from "@fhevm/host-contracts/addresses/FHEVMHostAddresses.sol";

/// @notice End-to-end integration test covering the full LastKey lifecycle:
///
///   1. Deploy protocol (WillExecutor -> WillFactory -> LivenessOracle)
///   2. Create will via factory (CREATE2)
///   3. Owner adds 2 beneficiaries (encrypted email hash + share + fallback)
///   4. Owner registers will with oracle
///   5. Fast-forward 366 days (past inactivity + heartbeat windows)
///   6. Oracle detects inactivity via checkUpkeep → performUpkeep → triggerExecution
///   7. Will enters CONFIRMING state
///   8. Two guardians call confirmDeceased → quorum → auto-finalizeExecution
///   9. Will state = EXECUTED, executor ACL access granted
///  10. executor.execute(will) — Phase 1: marks processed, emits handles
///  11. executor.resolveTransfer x2 — Phase 2: transfers ERC-20 proportionally
///  12. Assert beneficiary balances are correct
contract IntegrationTest is FhevmTest {

    // Protocol contracts
    WillExecutor   internal executor;
    WillFactory    internal factory;
    LivenessOracle internal oracle;
    FHEWill        internal will;

    // Test tokens
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    // Participants
    address internal admin        = makeAddr("admin");
    address internal willOwner    = makeAddr("willOwner");
    address internal beneficiary1 = makeAddr("beneficiary1");
    address internal beneficiary2 = makeAddr("beneficiary2");

    // Decrypted share values used in resolveTransfer (basis points stored by FHEWill)
    uint32 internal constant SHARE1_BPS = 6000; // 60%
    uint32 internal constant SHARE2_BPS = 4000; // 40%

    // Total assets allocated for distribution
    uint256 internal constant TOKEN_A_TOTAL = 10_000 ether;
    uint256 internal constant TOKEN_B_TOTAL = 5_000 ether;

    uint256 private _batchNonce;

    // ──────────────────────────────────────────────
    // Setup
    // ──────────────────────────────────────────────

    function setUp() public override {
        super.setUp();

        // 1. Deploy protocol
        vm.startPrank(admin);
        executor = new WillExecutor(admin);
        factory  = new WillFactory(address(executor));
        executor.setFactory(address(factory));
        oracle   = new LivenessOracle(address(factory), address(executor));
        vm.stopPrank();

        // 2. Will owner creates will via factory
        vm.prank(willOwner);
        will = FHEWill(factory.createWill(address(executor)));

        // 3. Mint tokens to will owner and approve executor as spender
        tokenA = new MockERC20("TokenA", "TKA");
        tokenB = new MockERC20("TokenB", "TKB");

        tokenA.mint(willOwner, TOKEN_A_TOTAL);
        tokenB.mint(willOwner, TOKEN_B_TOTAL);

        vm.startPrank(willOwner);
        tokenA.approve(address(executor), type(uint256).max);
        tokenB.approve(address(executor), type(uint256).max);
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    // Full lifecycle test
    // ──────────────────────────────────────────────

    function test_fullLifecycle() public {
        // ── Step 1: Add beneficiaries ─────────────────────────────────────────
        _addBeneficiary(willOwner, SHARE1_BPS, beneficiary1);
        _addBeneficiary(willOwner, SHARE2_BPS, beneficiary2);
        assertEq(will.beneficiaryCount(), 2);

        // ── Step 2: Register will with oracle ─────────────────────────────────
        oracle.registerWill(address(will));
        assertTrue(oracle.isRegistered(address(will)));
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.ACTIVE));

        // ── Step 3: Fast-forward past inactivity + heartbeat windows ──────────
        vm.warp(block.timestamp + 366 days);
        assertTrue(will.isInactive());
        assertTrue(will.isLivenessExpired());

        // ── Step 4: Oracle detects inactivity and triggers execution ──────────
        (bool upkeepNeeded, bytes memory performData) = oracle.checkUpkeep("");
        assertTrue(upkeepNeeded);
        assertEq(abi.decode(performData, (address)), address(will));

        oracle.performUpkeep(performData);
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));

        // ── Step 5: Guardian quorum confirms death → auto-finalizes ──────────
        will.confirmDeceased(keccak256("guardian1@lastkey.xyz"));
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING)); // 1 of 2

        will.confirmDeceased(keccak256("guardian2@lastkey.xyz")); // quorum!
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.EXECUTED));

        // ── Step 6: Executor Phase 1 — mark as processed, emit handles ────────
        executor.execute(address(will));
        assertTrue(executor.executedWills(address(will)));

        // ── Step 7: Authorized relayer — Phase 2 — resolve transfers ──────────
        address[] memory tokens  = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = TOKEN_A_TOTAL;
        amounts[1] = TOKEN_B_TOTAL;

        // Beneficiary 1 — 60%
        vm.prank(admin);
        executor.resolveTransfer(
            address(will), willOwner, 0, SHARE1_BPS, beneficiary1, tokens, amounts
        );

        // Beneficiary 2 — 40%
        vm.prank(admin);
        executor.resolveTransfer(
            address(will), willOwner, 1, SHARE2_BPS, beneficiary2, tokens, amounts
        );

        // ── Step 8: Verify balances ────────────────────────────────────────────
        // Beneficiary 1: 60% of 10,000 TKA = 6,000 TKA; 60% of 5,000 TKB = 3,000 TKB
        assertEq(tokenA.balanceOf(beneficiary1), 6_000 ether, "B1 TKA");
        assertEq(tokenB.balanceOf(beneficiary1), 3_000 ether, "B1 TKB");

        // Beneficiary 2: 40% of 10,000 TKA = 4,000 TKA; 40% of 5,000 TKB = 2,000 TKB
        assertEq(tokenA.balanceOf(beneficiary2), 4_000 ether, "B2 TKA");
        assertEq(tokenB.balanceOf(beneficiary2), 2_000 ether, "B2 TKB");
    }

    // ──────────────────────────────────────────────
    // Owner cancels falsely triggered execution
    // ──────────────────────────────────────────────

    function test_ownerCanCancelAndRestoreActive() public {
        oracle.registerWill(address(will));
        vm.warp(block.timestamp + 366 days);

        // Oracle triggers
        (, bytes memory data) = oracle.checkUpkeep("");
        oracle.performUpkeep(data);
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));

        // Owner proves they're alive — cancels execution
        vm.prank(willOwner);
        will.cancelExecution();
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.ACTIVE));

        // After cancel, oracle finds no upkeep needed (owner is active again)
        (bool needed,) = oracle.checkUpkeep("");
        assertFalse(needed);
    }

    // ──────────────────────────────────────────────
    // Executor cannot run on unregistered / spoofed will
    // ──────────────────────────────────────────────

    function test_execute_revertsForSpoofedWill() public {
        address fakeWill = makeAddr("fakeWill");
        vm.expectRevert("WillExecutor: not a valid will");
        executor.execute(fakeWill);
    }

    // ──────────────────────────────────────────────
    // Oracle registration guards
    // ──────────────────────────────────────────────

    function test_oracle_rejectsNonFactoryWill() public {
        // Deploy a FHEWill directly (not via factory) — oracle must reject
        vm.prank(willOwner);
        FHEWill fakeWill = new FHEWill(willOwner, address(factory), address(executor));

        vm.expectRevert("LivenessOracle: not a factory will");
        oracle.registerWill(address(fakeWill));
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _addBeneficiary(address user, uint32 share, address fallbackWallet) internal {
        uint256 emailHash = uint256(keccak256(abi.encodePacked("email:", fallbackWallet)));
        address target    = address(will);

        bytes memory blob = abi.encodePacked(
            keccak256(abi.encodePacked("integration.batch", ++_batchNonce, user, target))
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
