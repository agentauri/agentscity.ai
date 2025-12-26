/**
 * World Grid - 100x100 isometric world
 */

import { WORLD_SIZE } from '@agentscity/shared';
import type { Agent, Location } from '../db/schema';

export interface GridCell {
  x: number;
  y: number;
  terrain: 'ground' | 'water' | 'building';
  walkable: boolean;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * Check if position is within world bounds
 */
export function isValidPosition(x: number, y: number): boolean {
  return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE;
}

/**
 * Calculate Manhattan distance between two positions
 */
export function getDistance(from: Position, to: Position): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

/**
 * Calculate Euclidean distance between two positions
 */
export function getEuclideanDistance(from: Position, to: Position): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get adjacent cells (4-directional)
 */
export function getAdjacentPositions(pos: Position): Position[] {
  const directions = [
    { x: 0, y: -1 }, // North
    { x: 1, y: 0 },  // East
    { x: 0, y: 1 },  // South
    { x: -1, y: 0 }, // West
  ];

  return directions
    .map((d) => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter((p) => isValidPosition(p.x, p.y));
}

/**
 * Get all positions within radius
 */
export function getPositionsInRadius(center: Position, radius: number): Position[] {
  const positions: Position[] = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = center.x + dx;
      const y = center.y + dy;

      if (isValidPosition(x, y) && getDistance(center, { x, y }) <= radius) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}

/**
 * Calculate movement cost between positions
 * Returns energy cost for the move
 */
export function getMovementCost(from: Position, to: Position): number {
  const distance = getDistance(from, to);

  // Base cost: 1 energy per tile
  // Diagonal moves are not allowed (Manhattan distance)
  return distance;
}

/**
 * Check if move is valid (single step only)
 */
export function isValidMove(from: Position, to: Position): boolean {
  // Must be adjacent (Manhattan distance = 1)
  const distance = getDistance(from, to);
  return distance === 1 && isValidPosition(to.x, to.y);
}

/**
 * Get path from A to B (simple implementation)
 * Returns array of positions to traverse
 */
export function getPath(from: Position, to: Position): Position[] {
  // Simple greedy pathfinding (can be replaced with A* later)
  const path: Position[] = [];
  let current = { ...from };

  while (current.x !== to.x || current.y !== to.y) {
    // Move in X direction first
    if (current.x < to.x) {
      current = { x: current.x + 1, y: current.y };
    } else if (current.x > to.x) {
      current = { x: current.x - 1, y: current.y };
    }
    // Then Y direction
    else if (current.y < to.y) {
      current = { x: current.x, y: current.y + 1 };
    } else if (current.y > to.y) {
      current = { x: current.x, y: current.y - 1 };
    }

    path.push({ ...current });
  }

  return path;
}

/**
 * Filter agents visible from a position (same location)
 */
export function getAgentsAtPosition(agents: Agent[], pos: Position): Agent[] {
  return agents.filter((a) => a.x === pos.x && a.y === pos.y && a.state !== 'dead');
}

/**
 * Filter locations at a position
 */
export function getLocationsAtPosition(locations: Location[], pos: Position): Location[] {
  return locations.filter((l) => l.x === pos.x && l.y === pos.y);
}

/**
 * Get agents within visibility radius
 */
export function getVisibleAgents(agents: Agent[], center: Position, radius: number): Agent[] {
  return agents.filter((a) => {
    if (a.state === 'dead') return false;
    return getDistance(center, { x: a.x, y: a.y }) <= radius;
  });
}

/**
 * Get locations within visibility radius
 */
export function getVisibleLocations(locations: Location[], center: Position, radius: number): Location[] {
  return locations.filter((l) => {
    return getDistance(center, { x: l.x, y: l.y }) <= radius;
  });
}
