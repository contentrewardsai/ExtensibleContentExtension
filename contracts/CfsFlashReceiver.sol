// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CfsFlashReceiver
 * @notice PancakeSwap V3 flash loan receiver for CFS automation testing.
 *
 * Workflow:
 *   1. CFS automation calls executeFlash() with pool, borrow params, and swap calldata
 *   2. This contract calls pool.flash() to borrow tokens
 *   3. In pancakeV3FlashCallback, it executes the provided swap calldata
 *   4. Repays the pool (borrowed + fee)
 *   5. Sends any excess (profit) back to the caller
 *
 * Deploy with: forge create --rpc-url https://bsc-dataseed1.binance.org/ \
 *   --private-key $PRIVATE_KEY contracts/CfsFlashReceiver.sol:CfsFlashReceiver \
 *   --constructor-args 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4
 *
 * Or compile + deploy via the MCP server Bun runtime.
 */

interface IPancakeV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;

    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract CfsFlashReceiver {
    address public immutable swapRouter;
    address public owner;

    event FlashExecuted(
        address indexed pool,
        address indexed borrowToken,
        uint256 borrowAmount,
        uint256 feeAmount,
        int256 profit
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _swapRouter) {
        swapRouter = _swapRouter;
        owner = msg.sender;
    }

    /**
     * @notice Entry point: initiate a flash loan from a PancakeSwap V3 pool.
     * @param pool          Address of the PancakeSwap V3 pool
     * @param borrowToken0  True to borrow token0, false for token1
     * @param borrowAmount  Amount to borrow (in the token's smallest units)
     * @param swapCalldata  ABI-encoded calldata for the swap(s) to execute during callback
     */
    function executeFlash(
        address pool,
        bool borrowToken0,
        uint256 borrowAmount,
        bytes calldata swapCalldata
    ) external onlyOwner {
        address borrowToken = borrowToken0
            ? IPancakeV3Pool(pool).token0()
            : IPancakeV3Pool(pool).token1();

        uint256 amount0 = borrowToken0 ? borrowAmount : 0;
        uint256 amount1 = borrowToken0 ? 0 : borrowAmount;

        // Encode callback data: caller, borrow token, swap calldata
        bytes memory data = abi.encode(
            msg.sender,
            borrowToken,
            borrowAmount,
            swapCalldata
        );

        IPancakeV3Pool(pool).flash(address(this), amount0, amount1, data);
    }

    /**
     * @notice PancakeSwap V3 flash callback — called by the pool after sending tokens.
     * @param fee0   Fee owed for token0 (in token0 units)
     * @param fee1   Fee owed for token1 (in token1 units)
     * @param data   Callback data encoded in executeFlash
     */
    function pancakeV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external {
        (
            address caller,
            address borrowToken,
            uint256 borrowAmount,
            bytes memory swapCalldata
        ) = abi.decode(data, (address, address, uint256, bytes));

        uint256 feeOwed = fee0 > 0 ? fee0 : fee1;
        uint256 balanceBefore = IERC20(borrowToken).balanceOf(address(this));

        // Execute the swap(s) — approve router and call
        if (swapCalldata.length > 0) {
            IERC20(borrowToken).approve(swapRouter, borrowAmount);

            (bool success, bytes memory returnData) = swapRouter.call(swapCalldata);
            require(success, string(abi.encodePacked("Swap failed: ", returnData)));
        }

        uint256 balanceAfter = IERC20(borrowToken).balanceOf(address(this));

        // Repay pool: borrowed + fee
        uint256 repayAmount = borrowAmount + feeOwed;
        require(balanceAfter >= repayAmount, "Insufficient balance to repay flash");
        IERC20(borrowToken).transfer(msg.sender, repayAmount); // msg.sender = pool

        // Send profit to the original caller
        uint256 profit = balanceAfter > repayAmount ? balanceAfter - repayAmount : 0;
        if (profit > 0) {
            IERC20(borrowToken).transfer(caller, profit);
        }

        int256 netProfit = int256(balanceAfter) - int256(balanceBefore);
        emit FlashExecuted(msg.sender, borrowToken, borrowAmount, feeOwed, netProfit);
    }

    /**
     * @notice Transfer ownership (e.g. to a multisig or the CFS wallet).
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    /**
     * @notice Rescue stuck tokens (safety mechanism).
     */
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    /**
     * @notice Rescue stuck BNB.
     */
    function rescueBNB() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {}
}
