// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script, console } from "forge-std/Script.sol";
import { WillExecutor }    from "../src/WillExecutor.sol";
import { WillFactory }     from "../src/WillFactory.sol";
import { LivenessOracle }  from "../src/LivenessOracle.sol";

/// @notice Deploys the full LastKey protocol in order:
///   1. WillExecutor (owner = deployer)
///   2. WillFactory  (default executor = WillExecutor)
///   3. WillExecutor.setFactory(WillFactory)  — one-time wiring
///   4. LivenessOracle (factory + executor refs)
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify
contract Deploy is Script {

    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy executor (owner = deployer / authorized relayer)
        WillExecutor executorContract = new WillExecutor(deployer);

        // 2. Deploy factory with executor as default
        WillFactory factoryContract = new WillFactory(address(executorContract));

        // 3. Wire factory into executor (one-time setter)
        executorContract.setFactory(address(factoryContract));

        // 4. Deploy oracle
        LivenessOracle oracleContract = new LivenessOracle(
            address(factoryContract),
            address(executorContract)
        );

        vm.stopBroadcast();

        console.log("============================================================");
        console.log("LastKey Protocol Deployed on Chain ID:", block.chainid);
        console.log("------------------------------------------------------------");
        console.log("WillExecutor  :", address(executorContract));
        console.log("WillFactory   :", address(factoryContract));
        console.log("LivenessOracle:", address(oracleContract));
        console.log("Deployer/Admin:", deployer);
        console.log("============================================================");
        console.log("Add to .env:");
        console.log("  WILL_EXECUTOR_ADDRESS=", address(executorContract));
        console.log("  WILL_FACTORY_ADDRESS=",  address(factoryContract));
        console.log("  LIVENESS_ORACLE_ADDRESS=", address(oracleContract));
        console.log("Register your oracle with Chainlink Automation at:");
        console.log("  https://automation.chain.link");
    }
}
