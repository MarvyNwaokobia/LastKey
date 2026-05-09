// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Test }            from "forge-std/Test.sol";
import { FhevmTest }       from "forge-fhevm/FhevmTest.sol";
import { Counter }         from "../src/Counter.sol";
import { euint64, externalEuint64 } from "encrypted-types/EncryptedTypes.sol";

contract CounterTest is FhevmTest {
    Counter counter;

    function setUp() public override {
        super.setUp();
        counter = new Counter();
    }

    function test_setNumber_stores_encrypted_value() public {
        address user = makeAddr("user");
        (externalEuint64 handle, bytes memory proof) =
            encryptUint64(42, user, address(counter));

        vm.prank(user);
        counter.setNumber(handle, proof);

        uint64 decrypted = decrypt(euint64.wrap(counter.getHandle()));
        assertEq(decrypted, 42);
    }

    function test_increment_adds_one() public {
        address user = makeAddr("user");
        (externalEuint64 handle, bytes memory proof) =
            encryptUint64(10, user, address(counter));

        vm.prank(user);
        counter.setNumber(handle, proof);

        counter.increment();

        uint64 decrypted = decrypt(euint64.wrap(counter.getHandle()));
        assertEq(decrypted, 11);
    }

    function test_increment_from_zero() public {
        counter.increment();

        uint64 decrypted = decrypt(euint64.wrap(counter.getHandle()));
        assertEq(decrypted, 1);
    }

    function test_setNumber_overwrites_previous_value() public {
        address user = makeAddr("user");

        (externalEuint64 h1, bytes memory p1) = encryptUint64(100, user, address(counter));
        vm.prank(user);
        counter.setNumber(h1, p1);

        (externalEuint64 h2, bytes memory p2) = encryptUint64(7, user, address(counter));
        vm.prank(user);
        counter.setNumber(h2, p2);

        uint64 decrypted = decrypt(euint64.wrap(counter.getHandle()));
        assertEq(decrypted, 7);
    }
}
