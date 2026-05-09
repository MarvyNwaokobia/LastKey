// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FhevmTest }   from "forge-fhevm/FhevmTest.sol";
import { WillFactory } from "../src/WillFactory.sol";
import { WillExecutor }from "../src/WillExecutor.sol";
import { FHEWill }     from "../src/FHEWill.sol";
import { IFHEWill }    from "../src/interfaces/IFHEWill.sol";

contract WillFactoryTest is FhevmTest {

    WillFactory  internal factory;
    WillExecutor internal executorContract;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        executorContract = new WillExecutor(admin);
        factory          = new WillFactory(address(executorContract));
        executorContract.setFactory(address(factory));
        vm.stopPrank();
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    function test_initialState() public view {
        assertEq(factory.owner(), admin);
        assertEq(factory.executor(), address(executorContract));
    }

    function test_constructor_revertsOnZeroExecutor() public {
        vm.expectRevert("WillFactory: zero executor");
        new WillFactory(address(0));
    }

    // ── createWill ────────────────────────────────────────────────────────────

    function test_createWill_deploysContract() public {
        vm.prank(alice);
        address willAddr = factory.createWill(address(0));
        assertTrue(willAddr != address(0));
        assertEq(factory.getWill(alice), willAddr);
        assertTrue(factory.hasWill(alice));
    }

    function test_createWill_setsCorrectConstructorArgs() public {
        vm.prank(alice);
        address willAddr = factory.createWill(address(0));
        FHEWill will = FHEWill(willAddr);
        assertEq(will.owner(),    alice);
        assertEq(will.factory(),  address(factory));
        assertEq(will.executor(), address(executorContract));
    }

    function test_createWill_usesCustomExecutor() public {
        address customExec = makeAddr("customExec");
        vm.prank(alice);
        address willAddr = factory.createWill(customExec);
        assertEq(FHEWill(willAddr).executor(), customExec);
    }

    function test_createWill_defaultInactivityWindow() public {
        vm.prank(alice);
        assertEq(FHEWill(factory.createWill(address(0))).inactivityWindow(), 365 days);
    }

    function test_createWill_stateIsActive() public {
        vm.prank(alice);
        address willAddr = factory.createWill(address(0));
        assertEq(uint8(FHEWill(willAddr).state()), uint8(IFHEWill.WillState.ACTIVE));
    }

    function test_createWill_revertsIfAlreadyExists() public {
        vm.prank(alice);
        factory.createWill(address(0));
        vm.prank(alice);
        vm.expectRevert("WillFactory: will already exists");
        factory.createWill(address(0));
    }

    function test_createWill_differentOwnersGetDifferentAddresses() public {
        vm.prank(alice); address a = factory.createWill(address(0));
        vm.prank(bob);   address b = factory.createWill(address(0));
        assertTrue(a != b);
    }

    // ── isValidWill ───────────────────────────────────────────────────────────

    function test_isValidWill_trueForFactoryDeployedWill() public {
        vm.prank(alice);
        address willAddr = factory.createWill(address(0));
        assertTrue(factory.isValidWill(willAddr));
    }

    function test_isValidWill_falseForArbitraryAddress() public {
        assertFalse(factory.isValidWill(makeAddr("random")));
    }

    function test_isValidWill_falseForZeroAddress() public {
        assertFalse(factory.isValidWill(address(0)));
    }

    // ── predictWillAddress ────────────────────────────────────────────────────

    function test_predictWillAddress_matchesDeployed() public {
        address predicted = factory.predictWillAddress(alice);
        vm.prank(alice);
        address deployed = factory.createWill(address(0));
        assertEq(predicted, deployed);
    }

    // ── hasWill / getWill ─────────────────────────────────────────────────────

    function test_hasWill_returnsFalseBeforeCreate() public view {
        assertFalse(factory.hasWill(alice));
    }

    function test_getWill_returnsZeroBeforeCreate() public view {
        assertEq(factory.getWill(alice), address(0));
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function test_setExecutor_updatesExecutor() public {
        address newExec = makeAddr("newExec");
        vm.prank(admin);
        factory.setExecutor(newExec);
        assertEq(factory.executor(), newExec);
    }

    function test_setExecutor_revertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setExecutor(makeAddr("x"));
    }
}
