// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FhevmTest }       from "forge-fhevm/FhevmTest.sol";
import { InputProofHelper } from "forge-fhevm/InputProofHelper.sol";
import { FheType }          from "@fhevm/host-contracts/contracts/shared/FheType.sol";
import { FHEWill }          from "../src/FHEWill.sol";
import { IFHEWill }         from "../src/interfaces/IFHEWill.sol";
import {
    euint32, euint256, eaddress,
    externalEuint256
} from "encrypted-types/EncryptedTypes.sol";
import {
    inputVerifierAdd, aclAdd
} from "@fhevm/host-contracts/addresses/FHEVMHostAddresses.sol";

contract FHEWillTest is FhevmTest {

    FHEWill internal will;

    address internal owner        = makeAddr("owner");
    address internal factoryAddr  = makeAddr("factory");
    address internal executorAddr = makeAddr("executor");
    address internal rando        = makeAddr("rando");

    uint256 internal constant INACTIVITY = 365 days;
    uint256 internal constant HEARTBEAT  = 30 days;

    // Counter for unique batch ciphertext seeds (each batch needs a fresh blob)
    uint256 private _batchNonce;

    // ──────────────────────────────────────────────
    // Setup
    // ──────────────────────────────────────────────

    function setUp() public override {
        super.setUp();
        vm.prank(factoryAddr);
        will = new FHEWill(owner, factoryAddr, executorAddr);
    }

    // ──────────────────────────────────────────────
    // Test 1 — Initial state
    // ──────────────────────────────────────────────

    function test_initialState() public view {
        assertEq(will.owner(),               owner);
        assertEq(will.factory(),             factoryAddr);
        assertEq(will.executor(),            executorAddr);
        assertEq(will.inactivityWindow(),    INACTIVITY);
        assertEq(will.heartbeatInterval(),   HEARTBEAT);
        assertEq(will.beneficiaryCount(),    0);
        assertEq(will.guardianCount(),       0);
        assertEq(will.guardianConfirmCount(), 0);
        assertEq(uint8(will.state()),        uint8(IFHEWill.WillState.ACTIVE));
        assertTrue(will.approvedExecutors(executorAddr));
        assertFalse(will.isLivenessExpired());
    }

    // ──────────────────────────────────────────────
    // Test 2 — addBeneficiary
    // ──────────────────────────────────────────────

    function test_addBeneficiary_incrementsBeneficiaryCount() public {
        _addBeneficiary(owner, 5000, makeAddr("alice"));
        assertEq(will.beneficiaryCount(), 1);
    }

    function test_addBeneficiary_secondSlotIncrements() public {
        _addBeneficiary(owner, 5000, makeAddr("alice"));
        _addBeneficiary(owner, 3000, makeAddr("bob"));
        assertEq(will.beneficiaryCount(), 2);
    }

    function test_addBeneficiary_decryptedShareMatchesInput() public {
        uint32 expectedShare = 6600;
        _addBeneficiary(owner, expectedShare, makeAddr("charlie"));

        vm.prank(owner);
        (, euint32 shareHandle, ) = will.getEncryptedBeneficiary(0);
        uint32 decrypted = decrypt(shareHandle);
        assertEq(decrypted, expectedShare);
    }

    function test_addBeneficiary_decryptedEmailMatchesInput() public {
        uint256 emailHash = uint256(keccak256("alice@example.com"));
        _addBeneficiaryWithEmail(owner, emailHash, 5000, makeAddr("alice"));

        vm.prank(owner);
        (euint256 emailHandle, , ) = will.getEncryptedBeneficiary(0);
        uint256 decrypted = decrypt(emailHandle);
        assertEq(decrypted, emailHash);
    }

    function test_addBeneficiary_revertsIfNotOwner() public {
        vm.prank(rando);
        vm.expectRevert();
        will.addBeneficiary(bytes32(0), bytes32(0), bytes32(0), "");
    }

    function test_addBeneficiary_revertsIfNotActive() public {
        _warpAndTrigger();
        vm.prank(owner);
        vm.expectRevert("FHEWill: not active");
        will.addBeneficiary(bytes32(0), bytes32(0), bytes32(0), "");
    }

    function test_addBeneficiary_revertsAtMaxCapacity() public {
        for (uint8 i = 0; i < 10; i++) {
            _addBeneficiary(owner, 1000, makeAddr(string(abi.encodePacked("b", i))));
        }
        assertEq(will.beneficiaryCount(), 10);
        vm.prank(owner);
        vm.expectRevert("FHEWill: max beneficiaries reached");
        will.addBeneficiary(bytes32(0), bytes32(0), bytes32(0), "");
    }

    // ──────────────────────────────────────────────
    // Test 3 — addGuardian
    // ──────────────────────────────────────────────

    function test_addGuardian_incrementsGuardianCount() public {
        _addGuardian(owner, "guardian1@x.com");
        assertEq(will.guardianCount(), 1);
    }

    function test_addGuardian_revertsWhenMaxReached() public {
        _addGuardian(owner, "g1@x.com");
        _addGuardian(owner, "g2@x.com");
        _addGuardian(owner, "g3@x.com");
        assertEq(will.guardianCount(), 3);
        vm.prank(owner);
        vm.expectRevert("FHEWill: max guardians reached");
        will.addGuardian(bytes32(0), "");
    }

    function test_addGuardian_revertsIfNotOwner() public {
        vm.prank(rando);
        vm.expectRevert();
        will.addGuardian(bytes32(0), "");
    }

    // ──────────────────────────────────────────────
    // Test 4 — submitHeartbeat
    // ──────────────────────────────────────────────

    function test_submitHeartbeat_updatesLastHeartbeatTimestamp() public {
        uint256 before = will.lastHeartbeatTimestamp();
        vm.warp(block.timestamp + 5 days);

        vm.prank(owner);
        will.submitHeartbeat(bytes("attestation"));

        assertGt(will.lastHeartbeatTimestamp(), before);
        assertEq(will.lastHeartbeatTimestamp(), block.timestamp);
    }

    function test_submitHeartbeat_revertsWithEmptyAttestation() public {
        vm.prank(owner);
        vm.expectRevert("FHEWill: empty attestation");
        will.submitHeartbeat("");
    }

    function test_submitHeartbeat_revertsIfNotOwner() public {
        vm.prank(rando);
        vm.expectRevert();
        will.submitHeartbeat(bytes("attestation"));
    }

    // ──────────────────────────────────────────────
    // Test 5 — recordActivity
    // ──────────────────────────────────────────────

    function test_recordActivity_updatesLastActivityTimestamp() public {
        uint256 before = will.lastActivityTimestamp();
        vm.warp(block.timestamp + 2 days);

        vm.prank(owner);
        will.recordActivity();

        assertGt(will.lastActivityTimestamp(), before);
        assertEq(will.lastActivityTimestamp(), block.timestamp);
    }

    function test_recordActivity_revertsConfirmingState_whenOwnerCalls() public {
        _warpAndTrigger();
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));

        vm.prank(owner);
        will.recordActivity();

        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.ACTIVE));
        assertEq(will.guardianConfirmCount(), 0);
    }

    function test_recordActivity_revertsIfUnauthorized() public {
        vm.prank(rando);
        vm.expectRevert("FHEWill: unauthorized");
        will.recordActivity();
    }

    // ──────────────────────────────────────────────
    // Test 6 — triggerExecution
    // ──────────────────────────────────────────────

    function test_triggerExecution_setsConfirmingAfterLivenessExpiry() public {
        _warpAndTrigger();
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));
    }

    function test_triggerExecution_revertsIfOwnerStillActive() public {
        vm.expectRevert("FHEWill: owner still active");
        will.triggerExecution();
    }

    function test_triggerExecution_revertsAfterFreshHeartbeat() public {
        // Warp past both windows so trigger would succeed
        vm.warp(block.timestamp + 400 days);

        // Owner submits heartbeat — also calls _recordActivity, resetting lastActivityTimestamp
        vm.prank(owner);
        will.submitHeartbeat(bytes("alive"));

        // Now trigger fails because owner JUST proved liveness (activity timestamp reset)
        vm.expectRevert("FHEWill: owner still active");
        will.triggerExecution();
    }

    function test_livenessExpires_afterInactivityWindow() public {
        assertFalse(will.isLivenessExpired());
        vm.warp(block.timestamp + INACTIVITY + 1);
        assertTrue(will.isLivenessExpired());
    }

    // ──────────────────────────────────────────────
    // Test 7 — cancelExecution
    // ──────────────────────────────────────────────

    function test_cancelExecution_restoresActiveState() public {
        _warpAndTrigger();
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));

        vm.prank(owner);
        will.cancelExecution();

        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.ACTIVE));
    }

    function test_cancelExecution_resetsGuardianConfirmCount() public {
        _warpAndTrigger();
        will.confirmDeceased(keccak256("g1@x.com")); // count=1, stays CONFIRMING

        vm.prank(owner);
        will.cancelExecution();

        assertEq(will.guardianConfirmCount(), 0);
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.ACTIVE));
    }

    function test_cancelExecution_revertsIfNotConfirming() public {
        vm.prank(owner);
        vm.expectRevert("FHEWill: not confirming");
        will.cancelExecution();
    }

    function test_cancelExecution_revertsIfNotOwner() public {
        _warpAndTrigger();
        vm.prank(rando);
        vm.expectRevert();
        will.cancelExecution();
    }

    // ──────────────────────────────────────────────
    // Test 8 — confirmDeceased
    // ──────────────────────────────────────────────

    function test_confirmDeceased_incrementsGuardianConfirmCount() public {
        _warpAndTrigger();

        bytes32 hash1 = keccak256("guardian1@x.com");
        will.confirmDeceased(hash1);

        assertEq(will.guardianConfirmCount(), 1);
        assertTrue(will.guardianConfirmed(hash1));
        // Only 1 — quorum not yet met (need 2), stays CONFIRMING
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));
    }

    function test_confirmDeceased_revertsOnDuplicate() public {
        _warpAndTrigger();
        bytes32 hash1 = keccak256("guardian1@x.com");
        will.confirmDeceased(hash1);

        vm.expectRevert("FHEWill: already confirmed");
        will.confirmDeceased(hash1);
    }

    function test_confirmDeceased_revertsIfNotConfirming() public {
        vm.expectRevert("FHEWill: not confirming");
        will.confirmDeceased(keccak256("g1@x.com"));
    }

    // ──────────────────────────────────────────────
    // Test 9 — finalizeExecution
    // ──────────────────────────────────────────────

    function test_finalizeExecution_setsExecutedAfterQuorum() public {
        _warpAndTrigger();

        // First confirmation — quorum not yet met
        will.confirmDeceased(keccak256("g1@x.com"));
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));

        // Second confirmation — quorum reached → auto-finalizes
        will.confirmDeceased(keccak256("g2@x.com"));
        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.EXECUTED));
    }

    function test_finalizeExecution_directCallByExecutor() public {
        _warpAndTrigger();

        vm.prank(executorAddr);
        will.finalizeExecution();

        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.EXECUTED));
    }

    function test_finalizeExecution_grantsExecutorAccessToHandles() public {
        uint32 expectedShare = 8888;
        _addBeneficiary(owner, expectedShare, makeAddr("heir"));
        _warpAndTrigger();

        vm.prank(executorAddr);
        will.finalizeExecution();

        // Executor can now read the encrypted beneficiary handle
        vm.prank(executorAddr);
        (, euint32 shareHandle, ) = will.getEncryptedBeneficiary(0);
        assertEq(decrypt(shareHandle), expectedShare);
    }

    function test_finalizeExecution_revertsIfNotConfirming() public {
        vm.prank(executorAddr);
        vm.expectRevert("FHEWill: not confirming");
        will.finalizeExecution();
    }

    function test_finalizeExecution_revertsIfUnauthorized() public {
        _warpAndTrigger();
        vm.prank(rando);
        vm.expectRevert("FHEWill: not authorized");
        will.finalizeExecution();
    }

    // ──────────────────────────────────────────────
    // Test 10 — getEncryptedBeneficiary access control
    // ──────────────────────────────────────────────

    function test_getEncryptedBeneficiary_ownerCanRead() public {
        _addBeneficiary(owner, 5000, makeAddr("heir"));

        vm.prank(owner);
        will.getEncryptedBeneficiary(0); // must not revert
    }

    function test_getEncryptedBeneficiary_executorCanRead() public {
        _addBeneficiary(owner, 5000, makeAddr("heir"));

        vm.prank(executorAddr);
        will.getEncryptedBeneficiary(0); // must not revert
    }

    function test_getEncryptedBeneficiary_randoCannotRead() public {
        _addBeneficiary(owner, 5000, makeAddr("heir"));

        vm.prank(rando);
        vm.expectRevert("FHEWill: not authorized");
        will.getEncryptedBeneficiary(0);
    }

    function test_getEncryptedBeneficiary_revertsOutOfRange() public {
        vm.prank(owner);
        vm.expectRevert("FHEWill: index out of range");
        will.getEncryptedBeneficiary(0); // beneficiaryCount == 0
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _warpAndTrigger() internal {
        vm.warp(block.timestamp + 366 days);
        will.triggerExecution();
    }

    function _addBeneficiary(address user, uint32 share, address fallbackWallet) internal {
        uint256 emailHash = uint256(keccak256(abi.encodePacked(fallbackWallet)));
        _addBeneficiaryWithEmail(user, emailHash, share, fallbackWallet);
    }

    function _addBeneficiaryWithEmail(
        address user,
        uint256 emailHash,
        uint32  share,
        address fallbackWallet
    ) internal {
        (
            bytes32 emailHandle,
            bytes32 shareHandle,
            bytes32 fallbackHandle,
            bytes memory batchProof
        ) = _encryptBatch3(emailHash, share, fallbackWallet, user, address(will));

        vm.prank(user);
        will.addBeneficiary(emailHandle, shareHandle, fallbackHandle, batchProof);
    }

    function _addGuardian(address user, string memory guardianEmail) internal {
        uint256 hashVal = uint256(keccak256(bytes(guardianEmail)));
        (externalEuint256 encGuardian, bytes memory proof) =
            encryptUint256(hashVal, user, address(will));

        vm.prank(user);
        will.addGuardian(externalEuint256.unwrap(encGuardian), proof);
    }

    /// @dev Create a proper batch proof with three handles at indices 0, 1, 2 from one ciphertext blob.
    ///
    ///      forge-fhevm's _encrypt always uses index=0, but the InputVerifier checks that
    ///      listHandles[embeddedIndex] == handle (line 312 InputVerifier.sol). Three index=0
    ///      handles in one proof would collide. This helper solves it by:
    ///        • Using InputProofHelper.computeInputHandle() with indices 0, 1, 2 from one blob.
    ///        • Writing plaintext values directly into _plaintexts (internal from PlaintextDBMixin).
    ///        • Building and signing the combined proof with MOCK_INPUT_SIGNER_PK.
    function _encryptBatch3(
        uint256 emailVal,
        uint32  shareVal,
        address fallbackVal,
        address user,
        address target
    ) internal returns (
        bytes32 emailHandle,
        bytes32 shareHandle,
        bytes32 fallbackHandle,
        bytes memory batchProof
    ) {
        // Unique ciphertext blob per batch call (avoids handle collisions across tests)
        bytes memory blob = abi.encodePacked(
            keccak256(abi.encodePacked("lastkey.batch", ++_batchNonce, user, target))
        );

        // Three handles sharing the same blobHash, but with distinct embedded indices
        emailHandle    = InputProofHelper.computeInputHandle(blob, 0, FheType.Uint256, aclAdd, uint64(block.chainid));
        shareHandle    = InputProofHelper.computeInputHandle(blob, 1, FheType.Uint32,  aclAdd, uint64(block.chainid));
        fallbackHandle = InputProofHelper.computeInputHandle(blob, 2, FheType.Uint160, aclAdd, uint64(block.chainid));

        // Register plaintexts in FhevmTest's internal DB so decrypt() works in tests
        _plaintexts[emailHandle]    = emailVal;
        _plaintexts[shareHandle]    = uint256(shareVal);
        _plaintexts[fallbackHandle] = uint256(uint160(fallbackVal));

        // Build a combined proof: handles must be ordered [index0, index1, index2]
        bytes32[] memory handles = new bytes32[](3);
        handles[0] = emailHandle;
        handles[1] = shareHandle;
        handles[2] = fallbackHandle;

        bytes32 domainSep = InputProofHelper.computeInputVerifierDomainSeparator(
            inputVerifierAdd, block.chainid
        );
        bytes32 digest = InputProofHelper.computeInputVerificationDigest(
            handles, user, target, block.chainid, EMPTY_EXTRA_DATA, domainSep
        );

        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signDigest(MOCK_INPUT_SIGNER_PK, digest);
        batchProof = InputProofHelper.assembleInputProof(handles, sigs, EMPTY_EXTRA_DATA);
    }
}
