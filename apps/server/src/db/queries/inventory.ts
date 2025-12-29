/**
 * Inventory queries
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, inventory, type InventoryItem } from '../index';
import { v4 as uuid } from 'uuid';

/**
 * Get an inventory item for an agent
 */
export async function getInventoryItem(
  agentId: string,
  itemType: string
): Promise<InventoryItem | undefined> {
  const result = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.agentId, agentId), eq(inventory.itemType, itemType)))
    .limit(1);
  return result[0];
}

/**
 * Get all inventory items for an agent
 */
export async function getAgentInventory(agentId: string): Promise<InventoryItem[]> {
  return db.select().from(inventory).where(eq(inventory.agentId, agentId));
}

/**
 * Check if agent has any consumable items (food, water, medicine)
 */
export async function hasConsumableItems(agentId: string): Promise<boolean> {
  const items = await db
    .select()
    .from(inventory)
    .where(eq(inventory.agentId, agentId))
    .limit(1);
  return items.length > 0;
}

/**
 * Add items to inventory (upsert - insert or increment quantity)
 */
export async function addToInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<InventoryItem> {
  const result = await db
    .insert(inventory)
    .values({
      id: uuid(),
      agentId,
      itemType,
      quantity,
    })
    .onConflictDoUpdate({
      target: [inventory.agentId, inventory.itemType],
      set: { quantity: sql`${inventory.quantity} + ${quantity}` },
    })
    .returning();
  return result[0];
}

/**
 * Remove items from inventory (decrement or delete if quantity reaches 0)
 * Returns the remaining quantity, or -1 if item not found
 */
export async function removeFromInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<number> {
  const item = await getInventoryItem(agentId, itemType);

  if (!item || item.quantity < quantity) {
    return -1; // Not enough items
  }

  const newQuantity = item.quantity - quantity;

  if (newQuantity <= 0) {
    // Delete the record
    await db.delete(inventory).where(eq(inventory.id, item.id));
    return 0;
  } else {
    // Update quantity
    await db
      .update(inventory)
      .set({ quantity: newQuantity })
      .where(eq(inventory.id, item.id));
    return newQuantity;
  }
}
