/**
 * Ledger Service - Double-entry accounting for CITY currency
 */

import { v4 as uuid } from 'uuid';
import { eq, desc, or } from 'drizzle-orm';
import { db, ledger, agents, type LedgerEntry } from '../db';

export type TransactionCategory =
  | 'salary'      // Work income
  | 'purchase'    // Buying items
  | 'consumption' // Using items (no money transfer, just tracking)
  | 'transfer'    // Agent-to-agent transfer
  | 'tax'         // Future: emergent taxation
  | 'welfare';    // Future: emergent welfare

export interface TransactionResult {
  success: boolean;
  txId: string;
  entries: LedgerEntry[];
  fromNewBalance?: number;
  toNewBalance?: number;
  error?: string;
}

/**
 * Get agent balance
 */
export async function getBalance(agentId: string): Promise<number> {
  const agent = await db.select({ balance: agents.balance })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return agent[0]?.balance ?? 0;
}

/**
 * Transfer CITY between accounts
 *
 * @param fromAgentId - Source agent (null = system/treasury)
 * @param toAgentId - Destination agent (null = system/treasury)
 * @param amount - Amount to transfer (must be positive)
 * @param category - Transaction category
 * @param description - Human-readable description
 * @param tick - Current simulation tick
 */
export async function transfer(
  fromAgentId: string | null,
  toAgentId: string | null,
  amount: number,
  category: TransactionCategory,
  description: string,
  tick: number
): Promise<TransactionResult> {
  const txId = uuid();

  // Validate amount
  if (amount <= 0) {
    return {
      success: false,
      txId,
      entries: [],
      error: 'Amount must be positive',
    };
  }

  // Check sender balance (if not system)
  let fromBalance: number | undefined;
  if (fromAgentId) {
    fromBalance = await getBalance(fromAgentId);
    if (fromBalance < amount) {
      return {
        success: false,
        txId,
        entries: [],
        error: `Insufficient balance: need ${amount}, have ${fromBalance}`,
      };
    }
  }

  // Create ledger entries
  const entries: LedgerEntry[] = [];
  const now = new Date();

  // Debit entry (from sender)
  const debitEntry = await db.insert(ledger).values({
    id: uuid(),
    txId,
    tick,
    fromAgentId,
    toAgentId,
    amount: -amount, // Negative for debit
    category,
    description,
    createdAt: now,
  }).returning();
  entries.push(debitEntry[0]);

  // Credit entry (to receiver)
  const creditEntry = await db.insert(ledger).values({
    id: uuid(),
    txId,
    tick,
    fromAgentId,
    toAgentId,
    amount: amount, // Positive for credit
    category,
    description,
    createdAt: now,
  }).returning();
  entries.push(creditEntry[0]);

  // Update balances
  let fromNewBalance: number | undefined;
  let toNewBalance: number | undefined;

  if (fromAgentId) {
    fromNewBalance = fromBalance! - amount;
    await db.update(agents)
      .set({ balance: fromNewBalance, updatedAt: now })
      .where(eq(agents.id, fromAgentId));
  }

  if (toAgentId) {
    const toBalance = await getBalance(toAgentId);
    toNewBalance = toBalance + amount;
    await db.update(agents)
      .set({ balance: toNewBalance, updatedAt: now })
      .where(eq(agents.id, toAgentId));
  }

  return {
    success: true,
    txId,
    entries,
    fromNewBalance,
    toNewBalance,
  };
}

/**
 * Pay salary to agent (from system)
 */
export async function paySalary(
  agentId: string,
  amount: number,
  tick: number,
  description = 'Work salary'
): Promise<TransactionResult> {
  return transfer(null, agentId, amount, 'salary', description, tick);
}

/**
 * Charge agent for purchase (to system)
 */
export async function chargePurchase(
  agentId: string,
  amount: number,
  tick: number,
  description = 'Item purchase'
): Promise<TransactionResult> {
  return transfer(agentId, null, amount, 'purchase', description, tick);
}

/**
 * Transfer between agents
 */
export async function transferBetweenAgents(
  fromAgentId: string,
  toAgentId: string,
  amount: number,
  tick: number,
  description = 'Agent transfer'
): Promise<TransactionResult> {
  return transfer(fromAgentId, toAgentId, amount, 'transfer', description, tick);
}

/**
 * Get transaction history for agent
 */
export async function getTransactionHistory(
  agentId: string,
  limit = 50
): Promise<LedgerEntry[]> {
  return db.select()
    .from(ledger)
    .where(or(
      eq(ledger.fromAgentId, agentId),
      eq(ledger.toAgentId, agentId)
    ))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);
}

/**
 * Get total money supply (sum of all agent balances)
 */
export async function getTotalMoneySupply(): Promise<number> {
  const result = await db.select({
    total: agents.balance
  }).from(agents);

  return result.reduce((sum, row) => sum + (row.total ?? 0), 0);
}
