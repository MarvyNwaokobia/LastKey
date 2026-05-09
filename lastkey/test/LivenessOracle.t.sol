// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FhevmTest }    from "forge-fhevm/FhevmTest.sol";
import { LivenessOracle } from "../src/LivenessOracle.sol";
import { WillFactory }   from "../src/WillFactory.sol";
import { WillExecutor }  from "../src/WillExecutor.sol";
import { FHEWill }       from "../src/FHEWill.sol";
import { IFHEWill }      from "../src/interfaces/IFHEWill.sol";

contract LivenessOracleTest is FhevmTest {

    LivenessOracle internal oracle;
    WillFactory    internal factory;
    WillExecutor   internal executor;
    FHEWill        internal will;

    address internal admin     = makeAddr("admin");
    address internal willOwner = makeAddr("willOwner");
    address internal rando     = makeAddr("rando");

    function setUp() public override {
        super.setUp();

        vm.startPrank(admin);
        executor = new WillExecutor(admin);
        factory  = new WillFactory(address(executor));
        executor.setFactory(address(factory));
        oracle   = new LivenessOracle(address(factory), address(executor));
        vm.stopPrank();

        vm.prank(willOwner);
        will = FHEWill(factory.createWill(address(executor)));
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    function test_initialState() public view {
        assertEq(oracle.factory(),  address(factory));
        assertEq(oracle.executor(), address(executor));
        assertEq(oracle.owner(),    admin);
        assertEq(oracle.checkInterval(), 1 days);
    }

    function test_constructor_revertsOnZeroFactory() public {
        vm.expectRevert("LivenessOracle: zero factory");
        new LivenessOracle(address(0), address(executor));
    }

    function test_constructor_revertsOnZeroExecutor() public {
        vm.expectRevert("LivenessOracle: zero executor");
        new LivenessOracle(address(factory), address(0));
    }

    // ── registerWill ──────────────────────────────────────────────────────────

    function test_registerWill_succeeds() public {
        oracle.registerWill(address(will));
        assertTrue(oracle.isRegistered(address(will)));
        assertEq(oracle.registeredWillsCount(), 1);
    }

    function test_registerWill_revertsForInvalidWill() public {
        address spoofed = makeAddr("spoofed");
        vm.expectRevert("LivenessOracle: not a factory will");
        oracle.registerWill(spoofed);
    }

    function test_registerWill_revertsIfAlreadyRegistered() public {
        oracle.registerWill(address(will));
        vm.expectRevert("LivenessOracle: already registered");
        oracle.registerWill(address(will));
    }

    // ── checkUpkeep ───────────────────────────────────────────────────────────

    function test_checkUpkeep_returnsFalseWhenNoWillsRegistered() public view {
        (bool needed,) = oracle.checkUpkeep("");
        assertFalse(needed);
    }

    function test_checkUpkeep_returnsFalseWhenOwnerActive() public {
        oracle.registerWill(address(will));
        (bool needed,) = oracle.checkUpkeep("");
        assertFalse(needed); // owner still active, no time has passed
    }

    function test_checkUpkeep_returnsTrueWhenInactive() public {
        oracle.registerWill(address(will));
        vm.warp(block.timestamp + 366 days); // past inactivity + heartbeat windows

        (bool needed, bytes memory data) = oracle.checkUpkeep("");
        assertTrue(needed);
        assertEq(abi.decode(data, (address)), address(will));
    }

    function test_checkUpkeep_returnsFalseWithinCheckInterval() public {
        oracle.registerWill(address(will));
        vm.warp(block.timestamp + 366 days);

        // First check passes
        (bool needed,) = oracle.checkUpkeep("");
        assertTrue(needed);

        // Perform upkeep — resets lastChecked
        (, bytes memory data) = oracle.checkUpkeep("");
        oracle.performUpkeep(data);

        // Within checkInterval (1 day), no upkeep needed
        vm.warp(block.timestamp + 12 hours);
        (needed,) = oracle.checkUpkeep("");
        assertFalse(needed);
    }

    // ── performUpkeep ─────────────────────────────────────────────────────────

    function test_performUpkeep_callsTriggerExecution() public {
        oracle.registerWill(address(will));
        vm.warp(block.timestamp + 366 days);

        (, bytes memory data) = oracle.checkUpkeep("");
        oracle.performUpkeep(data);

        assertEq(uint8(will.state()), uint8(IFHEWill.WillState.CONFIRMING));
    }

    function test_performUpkeep_updatesLastChecked() public {
        oracle.registerWill(address(will));
        vm.warp(block.timestamp + 366 days);

        (, bytes memory data) = oracle.checkUpkeep("");
        oracle.performUpkeep(data);

        assertEq(oracle.lastChecked(address(will)), block.timestamp);
    }

    function test_performUpkeep_revertsIfConditionsNotMet() public {
        oracle.registerWill(address(will));
        // Don't warp — owner is still active

        vm.expectRevert("LivenessOracle: conditions not met");
        oracle.performUpkeep(abi.encode(address(will)));
    }

    // ── deregisterWill ────────────────────────────────────────────────────────

    function test_deregisterWill_byAdmin() public {
        oracle.registerWill(address(will));
        vm.prank(admin);
        oracle.deregisterWill(address(will));
        assertFalse(oracle.isRegistered(address(will)));
    }

    function test_deregisterWill_byWillOwner() public {
        oracle.registerWill(address(will));
        vm.prank(willOwner);
        oracle.deregisterWill(address(will));
        assertFalse(oracle.isRegistered(address(will)));
    }

    function test_deregisterWill_revertsIfUnauthorized() public {
        oracle.registerWill(address(will));
        vm.prank(rando);
        vm.expectRevert("LivenessOracle: not authorized");
        oracle.deregisterWill(address(will));
    }

    // ── setCheckInterval ──────────────────────────────────────────────────────

    function test_setCheckInterval_byAdmin() public {
        vm.prank(admin);
        oracle.setCheckInterval(6 hours);
        assertEq(oracle.checkInterval(), 6 hours);
    }

    function test_setCheckInterval_revertsTooShort() public {
        vm.prank(admin);
        vm.expectRevert("LivenessOracle: interval too short");
        oracle.setCheckInterval(30 minutes);
    }
}
