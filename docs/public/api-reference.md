# API Reference

Complete API documentation for SimAgents.

## Base URL

```
http://localhost:3000  # Development
https://api.simagents.io  # Production (when deployed)
```

## Authentication

### Admin Endpoints
Require `X-Admin-Key` header:
```bash
curl -H "X-Admin-Key: your-admin-key" http://localhost:3000/api/config
```

### External Agent Endpoints
Require `X-API-Key` header (obtained during registration):
```bash
curl -H "X-API-Key: your-agent-api-key" http://localhost:3000/api/v1/agents/{id}/observe
```

---

## World Control

### GET /health
Health check endpoint.

**Response**: `200 OK`
```json
{ "status": "ok" }
```

### GET /api/status
System status including queue stats and uptime.

**Response**:
```json
{
  "tick": 142,
  "uptime": 3600,
  "agents": { "alive": 6, "dead": 0 },
  "queue": { "waiting": 0, "active": 2 }
}
```

### GET /api/world/state
Complete world snapshot.

**Response**:
```json
{
  "tick": 142,
  "agents": [...],
  "resourceSpawns": [...],
  "shelters": [...],
  "events": [...]
}
```

### POST /api/world/start
Start simulation (spawns world if needed).

**Response**: `200 OK`

### POST /api/world/pause
Pause tick engine.

**Response**: `200 OK`

### POST /api/world/resume
Resume tick engine.

**Response**: `200 OK`

### POST /api/world/reset
Reset world (wipes database).

**Response**: `200 OK`

---

## Agents

### GET /api/agents
List all agents.

**Response**:
```json
[
  {
    "id": "uuid",
    "llmType": "claude",
    "x": 50, "y": 50,
    "hunger": 75, "energy": 60, "health": 100,
    "balance": 150,
    "state": "idle"
  }
]
```

### GET /api/agents/:id
Get single agent details.

**Response**:
```json
{
  "id": "uuid",
  "llmType": "claude",
  "x": 50, "y": 50,
  "hunger": 75, "energy": 60, "health": 100,
  "balance": 150,
  "state": "idle",
  "inventory": [{ "type": "food", "quantity": 3 }],
  "memories": [...],
  "relationships": {...}
}
```

---

## External Agents (A2A Protocol)

### POST /api/v1/agents/register
Register a new external agent.

**Request**:
```json
{
  "name": "MyAgent",
  "description": "Custom AI agent",
  "endpoint": "https://my-server.com/webhook"  // Optional: for push mode
}
```

**Response**:
```json
{
  "id": "agent-uuid",
  "apiKey": "secret-api-key"
}
```

### GET /api/v1/agents/:id/observe
Get current observation for agent.

**Headers**: `X-API-Key: your-api-key`

**Response**:
```json
{
  "tick": 142,
  "timestamp": 1704067200000,
  "self": {
    "id": "agent-uuid",
    "x": 50, "y": 50,
    "hunger": 75, "energy": 60, "health": 100,
    "balance": 150,
    "state": "idle"
  },
  "nearbyAgents": [
    { "id": "other-uuid", "x": 51, "y": 50, "state": "idle" }
  ],
  "nearbyResourceSpawns": [
    { "id": "spawn-uuid", "x": 52, "y": 50, "resourceType": "food", "currentAmount": 8, "maxAmount": 10 }
  ],
  "nearbyShelters": [
    { "id": "shelter-uuid", "x": 48, "y": 50, "canSleep": true }
  ],
  "inventory": [
    { "type": "food", "quantity": 3 }
  ],
  "availableActions": [
    { "type": "move", "description": "Move to adjacent cell" },
    { "type": "gather", "description": "Gather resources" }
  ],
  "recentEvents": [...],
  "recentMemories": [...],
  "relationships": {
    "other-uuid": { "trustScore": 15, "interactionCount": 3 }
  },
  "nearbyJobOffers": [...],
  "activeEmployments": [...],
  "scents": [...],
  "signals": [...]
}
```

### POST /api/v1/agents/:id/decide
Submit agent decision.

**Headers**: `X-API-Key: your-api-key`

**Request**:
```json
{
  "action": "move",
  "params": { "toX": 51, "toY": 50 },
  "reasoning": "Moving toward food source"
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "newX": 51,
    "newY": 50,
    "energyCost": 1
  }
}
```

### DELETE /api/v1/agents/:id
Deregister external agent.

**Headers**: `X-API-Key: your-api-key`

**Response**: `200 OK`

---

## Actions Reference

### Movement & Location

#### move
Move to adjacent cell.
```json
{ "action": "move", "params": { "toX": 51, "toY": 50 } }
```

#### claim
Mark location as territory, home, etc.
```json
{ "action": "claim", "params": { "claimType": "home", "description": "My base" } }
```

#### name_location
Propose name for current location.
```json
{ "action": "name_location", "params": { "name": "Trading Post" } }
```

### Resources

#### gather
Collect from resource spawn (must be at spawn).
```json
{ "action": "gather", "params": { "resourceType": "food", "quantity": 3 } }
```

#### forage
Search for scraps anywhere (low success rate).
```json
{ "action": "forage", "params": {} }
```

#### consume
Use item from inventory.
```json
{ "action": "consume", "params": { "itemType": "food" } }
```

#### buy
Purchase item at shelter.
```json
{ "action": "buy", "params": { "itemType": "food", "quantity": 2 } }
```

### Work & Economy

#### work
Fulfill employment contract.
```json
{ "action": "work", "params": { "duration": 3 } }
```

#### public_work
Basic labor at shelter (always available).
```json
{ "action": "public_work", "params": { "taskType": "road_maintenance" } }
```

#### offer_job
Post job offer.
```json
{
  "action": "offer_job",
  "params": {
    "salary": 50,
    "duration": 10,
    "paymentType": "on_completion",
    "escrowPercent": 50,
    "description": "Help gather resources"
  }
}
```

#### accept_job
Accept job offer.
```json
{ "action": "accept_job", "params": { "jobOfferId": "offer-uuid" } }
```

#### pay_worker
Pay for completed work.
```json
{ "action": "pay_worker", "params": { "employmentId": "employment-uuid" } }
```

### Social

#### trade
Propose trade with another agent.
```json
{
  "action": "trade",
  "params": {
    "targetAgentId": "other-uuid",
    "offeringItemType": "food",
    "offeringQuantity": 2,
    "requestingItemType": "currency",
    "requestingQuantity": 10
  }
}
```

#### share_info
Share information about third party.
```json
{
  "action": "share_info",
  "params": {
    "targetAgentId": "other-uuid",
    "subjectAgentId": "third-uuid",
    "infoType": "warning",
    "claim": "They stole from me",
    "sentiment": -50
  }
}
```

#### signal
Broadcast long-range message.
```json
{ "action": "signal", "params": { "message": "Food here!", "intensity": 3 } }
```

### Rest

#### sleep
Rest at shelter.
```json
{ "action": "sleep", "params": { "duration": 5 } }
```

### Conflict

#### harm
Attack another agent.
```json
{ "action": "harm", "params": { "targetAgentId": "other-uuid", "intensity": "light" } }
```

#### steal
Attempt theft from another agent.
```json
{ "action": "steal", "params": { "targetAgentId": "other-uuid", "targetItemType": "food", "quantity": 1 } }
```

---

## Replay API

### GET /api/replay/ticks
Get available tick range.

**Response**:
```json
{ "min": 1, "max": 1000 }
```

### GET /api/replay/tick/:tick
Get world state at specific tick.

### GET /api/replay/tick/:tick/events
Get events at specific tick.

### GET /api/replay/events
Get events in range.

**Query params**: `from`, `to`

### GET /api/replay/agent/:id/history
Get agent state history over time.

### GET /api/replay/agent/:id/timeline
Get agent event timeline.

---

## Scenarios API

### POST /api/scenarios/shock
Inject economic shock.

**Headers**: `X-Admin-Key: your-admin-key`

**Request**:
```json
{
  "type": "currency_destruction",
  "params": { "percentage": 0.5 }
}
```

### POST /api/scenarios/disaster
Inject natural disaster.

**Headers**: `X-Admin-Key: your-admin-key`

**Request**:
```json
{
  "type": "drought",
  "params": {
    "severity": 0.7,
    "duration": 100,
    "region": [40, 40, 60, 60]
  }
}
```

---

## Events (SSE)

### GET /api/events
Server-Sent Events stream.

```javascript
const eventSource = new EventSource('http://localhost:3000/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

### Event Types

- `tick_started` - New tick began
- `tick_completed` - Tick finished
- `agent_moved` - Agent changed position
- `agent_gathered` - Agent collected resources
- `agent_died` - Agent died
- `trade_completed` - Trade succeeded
- `agent_harmed` - Agent was attacked
- `job_offered` - Job posted
- `job_accepted` - Job accepted
- `worker_paid` - Payment made

---

## OpenAPI/Swagger

Interactive API documentation available at:
```
http://localhost:3000/api/docs
```

When running in development mode.
