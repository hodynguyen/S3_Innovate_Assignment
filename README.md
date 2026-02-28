# S3 Innovate Assignment — Location & Booking API

A RESTful API backend that manages a **hierarchical tree of building locations** and a **room booking system** with business-rule enforcement. Built with NestJS, TypeScript, TypeORM, and PostgreSQL.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Design](#3-system-design)
4. [Database Design](#4-database-design)
5. [Business Rules](#5-business-rules)
6. [API Reference](#6-api-reference)
7. [Getting Started](#7-getting-started)
8. [Running Tests](#8-running-tests)
9. [Project Structure](#9-project-structure)

---

## 1. Project Overview

This API serves two domains:

**Location Management** — Locations are modelled as a recursive adjacency-list tree (Building → Floor → Room → Sub-room). Each node carries a unique human-readable identifier (`locationNumber`), optional department ownership, occupancy capacity, and an operating-hours window (`openTime`). Standard CRUD operations are exposed for managing the full tree.

**Booking Management** — A booking reserves a specific location for a given time window. Before persisting a booking the system enforces three business rules: the requester's department must match the location's assigned department, the number of attendees must not exceed the location's capacity, and both the start and end times must fall within the location's `openTime` window.

---

## 2. Tech Stack

| Concern            | Technology                          | Version  |
|--------------------|-------------------------------------|----------|
| Runtime            | Node.js                             | 18+      |
| Framework          | NestJS                              | ^10.0    |
| Language           | TypeScript                          | ^5.1     |
| ORM                | TypeORM                             | ^0.3     |
| Database           | PostgreSQL                          | 16       |
| Validation         | class-validator + class-transformer | ^0.14    |
| API Documentation  | Swagger / OpenAPI (`@nestjs/swagger`)| ^7.0    |
| Testing            | Jest + ts-jest                      | ^29.5    |
| Containerisation   | Docker + docker-compose             | —        |

---

## 3. System Design

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│              (HTTP / Swagger UI at /api)                │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────────────┐
│                    NestJS Application                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Global Layer                                    │   │
│  │  ┌─────────────────┐  ┌──────────────────────┐  │   │
│  │  │ ValidationPipe  │  │  HttpExceptionFilter │  │   │
│  │  │ (whitelist,     │  │  (structured error   │  │   │
│  │  │  transform)     │  │   response + logging)│  │   │
│  │  └─────────────────┘  └──────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │  LocationsModule │     │      BookingsModule       │  │
│  │                  │     │                           │  │
│  │  Controller      │     │  Controller               │  │
│  │  Service         │◄────│  Service                  │  │
│  │  Entity          │     │  Entity                   │  │
│  │  DTOs            │     │  DTOs                     │  │
│  └────────┬─────────┘     └──────────┬────────────────┘  │
│           │                          │                   │
│  ┌────────▼──────────────────────────▼────────────────┐  │
│  │              TypeORM (TreeRepository / Repository) │  │
│  └────────────────────────┬───────────────────────────┘  │
└───────────────────────────│──────────────────────────────┘
                            │
            ┌───────────────▼───────────────┐
            │         PostgreSQL 16          │
            │   (Docker container / managed) │
            └───────────────────────────────┘
```

### 3.2 Module Structure

```
AppModule
├── LocationsModule
│   ├── LocationsController  — HTTP routing for /locations
│   ├── LocationsService     — CRUD + tree operations via TreeRepository
│   └── Location entity      — adjacency-list tree node
└── BookingsModule
    ├── BookingsController   — HTTP routing for /bookings
    ├── BookingsService      — booking creation with rule enforcement
    └── Booking entity       — booking record linked to a Location
```

The `common/` directory holds shared utilities consumed by any module:

- `common/filters/http-exception.filter.ts` — global exception filter
- `common/utils/open-time.parser.ts` — openTime string parser used by BookingsService

### 3.3 Booking Creation Request Flow

This is the most complex flow in the system because it traverses multiple validation layers before writing to the database.

```
Client
  │
  │  POST /bookings  { locationNumber, department, attendees, startTime, endTime }
  ▼
BookingsController.create()
  │
  ▼
[ValidationPipe]  ──── invalid body ───► 400 Bad Request
  │
  ▼
BookingsService.create()
  │
  ├─1─ LocationsService.findOne(locationNumber)
  │       └── not found ───────────────────────► 404 Not Found
  │
  ├─2─ startTime < endTime?
  │       └── no ──────────────────────────────► 400 Bad Request
  │
  ├─3─ location.department != null && location.capacity != null?
  │       └── no (not bookable) ───────────────► 400 Bad Request
  │
  ├─4─ location.department === dto.department?
  │       └── no (dept mismatch) ─────────────► 400 Bad Request
  │
  ├─5─ dto.attendees <= location.capacity?
  │       └── no (over capacity) ─────────────► 400 Bad Request
  │
  ├─6─ isWithinOpenTime(openTime, startTime)?
  │       └── no ──────────────────────────────► 400 Bad Request
  │
  ├─7─ isWithinOpenTime(openTime, endTime)?
  │       └── no ──────────────────────────────► 400 Bad Request
  │
  ▼
bookingRepo.save(booking)
  │
  ▼
201 Created  { id, location, department, attendees, startTime, endTime, createdAt }
```

---

## 4. Database Design

### 4.1 Entity-Relationship Overview

The database has two tables. `location` is self-referential (adjacency list) — each row optionally points to a parent row in the same table. `booking` has a many-to-one relationship with `location` — each booking targets exactly one location, and deleting a location cascades to its bookings.

### 4.2 `location` Table

| Column           | Type                         | Constraints                          | Notes                                          |
|------------------|------------------------------|--------------------------------------|------------------------------------------------|
| `id`             | `integer`                    | PK, auto-increment                   | Internal surrogate key                         |
| `locationNumber` | `varchar`                    | NOT NULL, UNIQUE, indexed            | Human-readable identifier, used in URL paths   |
| `locationName`   | `varchar`                    | NOT NULL                             | Display name (e.g. "Meeting Room 1")           |
| `building`       | `varchar`                    | NOT NULL                             | Building code (e.g. "A", "B")                  |
| `department`     | `varchar`                    | nullable                             | Owning department; null for structural nodes   |
| `capacity`       | `integer`                    | nullable                             | Max occupancy; null for non-bookable nodes     |
| `openTime`       | `varchar`                    | nullable                             | Operating hours string (see §5.2)              |
| `parentId`       | `integer`                    | FK → `location.id`, ON DELETE CASCADE| null for root/building-level nodes             |
| `createdAt`      | `timestamp with time zone`   | NOT NULL, default now()              | Managed by TypeORM `@CreateDateColumn`         |
| `updatedAt`      | `timestamp with time zone`   | NOT NULL, default now()              | Managed by TypeORM `@UpdateDateColumn`         |

**Tree strategy:** TypeORM adjacency-list (`@Tree('adjacency-list')`). The `parentId` foreign key is managed automatically by `@TreeParent` / `@TreeChildren`. Deleting a parent cascades to all descendants.

### 4.3 `booking` Table

| Column       | Type                        | Constraints                               | Notes                                    |
|--------------|-----------------------------|-------------------------------------------|------------------------------------------|
| `id`         | `integer`                   | PK, auto-increment                        | Internal surrogate key                   |
| `locationId` | `integer`                   | FK → `location.id`, NOT NULL, ON DELETE CASCADE | The booked location               |
| `department` | `varchar`                   | NOT NULL                                  | Department that made the booking         |
| `attendees`  | `integer`                   | NOT NULL                                  | Number of attendees at booking time      |
| `startTime`  | `timestamp with time zone`  | NOT NULL                                  | Booking start (UTC ISO 8601 from client) |
| `endTime`    | `timestamp with time zone`  | NOT NULL                                  | Booking end (UTC ISO 8601 from client)   |
| `createdAt`  | `timestamp with time zone`  | NOT NULL, default now()                   | Managed by TypeORM `@CreateDateColumn`   |

### 4.4 ASCII ERD

```
┌──────────────────────────────────────────────────────┐
│                       location                       │
├──────────────────────────────────────────────────────┤
│ PK  id             integer         NOT NULL          │
│     locationNumber varchar         NOT NULL UNIQUE   │
│     locationName   varchar         NOT NULL          │
│     building       varchar         NOT NULL          │
│     department     varchar         NULL              │
│     capacity       integer         NULL              │
│     openTime       varchar         NULL              │
│ FK  parentId       integer         NULL ──────┐      │
│     createdAt      timestamptz     NOT NULL   │      │
│     updatedAt      timestamptz     NOT NULL   │      │
└────────────────────────────────────┬─────────┘      │
                                     │ (self-ref)      │
                                     └─────────────────┘
                         (parent-child adjacency list)

                                 │ 1
                                 │
                                 │ has many
                                 ▼ *
┌──────────────────────────────────────────────────────┐
│                       booking                        │
├──────────────────────────────────────────────────────┤
│ PK  id             integer         NOT NULL          │
│ FK  locationId     integer         NOT NULL          │
│     department     varchar         NOT NULL          │
│     attendees      integer         NOT NULL          │
│     startTime      timestamptz     NOT NULL          │
│     endTime        timestamptz     NOT NULL          │
│     createdAt      timestamptz     NOT NULL          │
└──────────────────────────────────────────────────────┘
```

---

## 5. Business Rules

### 5.1 Booking Validation Rules

All three rules are enforced by `BookingsService.create()` before any write occurs. Violations return `400 Bad Request` with a descriptive message.

#### Rule 1 — Location Must Be Bookable

A location is only bookable if it has both a `department` and a `capacity` defined. Structural nodes such as floors and corridors have neither, and are rejected before any other check.

```
location.department != null  AND  location.capacity != null
```

Example of a non-bookable node: `A-01` (Floor 1) — no department, no capacity.
Example of a bookable node: `A-01-01` (Meeting Room 1) — department=EFM, capacity=10.

#### Rule 2 — Department Matching

The `department` field in the booking request must exactly match the `department` stored on the location.

```
booking.department === location.department
```

| Location       | location.department | booking.department | Result  |
|----------------|---------------------|--------------------|---------|
| A-01-01        | EFM                 | EFM                | Allowed |
| A-01-01        | EFM                 | FSS                | Rejected |
| B-05-11        | ASS                 | ASS                | Allowed |

#### Rule 3 — Capacity Check

The number of attendees in the booking must not exceed the location's capacity.

```
booking.attendees <= location.capacity
```

| Location   | capacity | attendees | Result   |
|------------|----------|-----------|----------|
| A-01-01    | 10       | 8         | Allowed  |
| A-01-01    | 10       | 10        | Allowed  |
| A-01-01    | 10       | 11        | Rejected |

#### Rule 4 — Open Time Validation

Both `startTime` and `endTime` of the booking must individually fall within the location's `openTime` window. The end-hour boundary is exclusive (e.g. `9AM to 6PM` means `hour < 18`).

```
isWithinOpenTime(location.openTime, startTime) === true
isWithinOpenTime(location.openTime, endTime)   === true
```

### 5.2 openTime Format

The `openTime` field is stored as a plain string and parsed at runtime by `open-time.parser.ts`.

**Supported formats:**

| Format                         | Meaning                                    |
|--------------------------------|--------------------------------------------|
| `Always open`                  | No restriction — any day and time is valid |
| `Mon to Fri (9AM to 6PM)`      | Monday through Friday, 09:00–18:00 (UTC)   |
| `Mon to Sat (9AM to 6PM)`      | Monday through Saturday, 09:00–18:00 (UTC) |
| `Mon to Sun (9AM to 6PM)`      | Every day, 09:00–18:00 (UTC)               |

**Parsing rules:**
- Day range is inclusive on both ends: `Mon to Fri` includes Mon, Tue, Wed, Thu, Fri.
- Hour range: start is inclusive, end is exclusive. `9AM to 6PM` = `09:00 <= time < 18:00`.
- Timezone: all comparisons use UTC. Clients must submit booking times as UTC ISO 8601 strings where the UTC value represents the local wall-clock time at the building (no server-side timezone conversion is applied).
- `12PM` = noon (12:00), `12AM` = midnight (0:00) — standard 12-hour AM/PM parsing.

---

## 6. API Reference

Full interactive documentation is available at `http://localhost:3000/api` (Swagger UI) once the application is running.

### Locations

| Method   | Path                           | Description                                                 |
|----------|--------------------------------|-------------------------------------------------------------|
| `POST`   | `/locations`                   | Create a new location node                                  |
| `GET`    | `/locations`                   | Get the full nested location tree                           |
| `GET`    | `/locations/:locationNumber`   | Get a specific location and all its descendants             |
| `PATCH`  | `/locations/:locationNumber`   | Partially update a location's attributes                    |
| `DELETE` | `/locations/:locationNumber`   | Delete a location and cascade to all descendants + bookings |

### Bookings

| Method | Path            | Description                                                          |
|--------|-----------------|----------------------------------------------------------------------|
| `POST` | `/bookings`     | Create a booking (enforces department, capacity, and open-time rules)|
| `GET`  | `/bookings`     | Get all bookings (ordered by creation date, newest first)            |
| `GET`  | `/bookings/:id` | Get a single booking by numeric ID                                   |

### Error Response Shape

All errors return a consistent JSON body:

```json
{
  "statusCode": 400,
  "timestamp": "2026-03-10T09:15:30.123Z",
  "path": "/bookings",
  "method": "POST",
  "message": "Capacity exceeded: location 'A-01-01' holds 10 people, requested 15"
}
```

---

## 7. Getting Started

### 7.1 Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **Docker** and **Docker Compose** (for PostgreSQL)

### 7.2 Clone and Install

```bash
git clone <repository-url>
cd s3-innovate-assignment
npm install
```

### 7.3 Start PostgreSQL

```bash
docker-compose up -d
```

This starts a PostgreSQL 16 container (`s3_innovate_db`) on port `5432` with a persistent named volume.

### 7.4 Configure Environment

```bash
cp .env.example .env
```

The default `.env` values match the docker-compose database configuration and require no changes for local development:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=password
DB_NAME=s3_innovate

TYPEORM_SYNC=true   # auto-syncs schema on startup; set to false in production
```

### 7.5 Run in Development Mode

```bash
npm run start:dev
```

The API is now available at `http://localhost:3000`.
Swagger UI is available at `http://localhost:3000/api`.

NestJS will watch for file changes and restart automatically.

### 7.6 Seed Sample Data (Optional)

Load the sample locations and a representative booking from the assignment brief:

```bash
npm run seed
```

This populates Building A (Floor 1, Meeting Rooms 1 and 2, Lobby, Corridor) and Building B (Floor 5, Utility Room, Sanitary Room, Meeting Toilet, Genset Room, Pantry, Corridor).

### 7.7 Verify the API

```bash
# Get the full location tree
curl http://localhost:3000/locations

# Create a booking for Meeting Room 1 (department EFM, capacity 10)
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "locationNumber": "A-01-01",
    "department": "EFM",
    "attendees": 8,
    "startTime": "2026-03-10T09:00:00Z",
    "endTime": "2026-03-10T11:00:00Z"
  }'
```

---

## 8. Running Tests

```bash
# Run all unit tests (59 tests across 3 suites)
npm test

# Run with coverage report
npm run test:cov

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a single test file
npm test -- --testPathPattern=open-time.parser
```

**Test suites:**

| Suite                            | Covers                                                         |
|----------------------------------|----------------------------------------------------------------|
| `open-time.parser.spec.ts`       | All openTime parsing cases: Always open, day ranges, hours, edge cases |
| `locations.service.spec.ts`      | CRUD operations, tree lookup, conflict and not-found handling  |
| `bookings.service.spec.ts`       | All 4 booking validation rules and the happy path             |

---

## 9. Project Structure

```
s3-innovate-assignment/
├── src/
│   ├── main.ts                              # Bootstrap: Swagger, ValidationPipe, global filter, port
│   ├── app.module.ts                        # Root module — imports LocationsModule, BookingsModule
│   │
│   ├── locations/
│   │   ├── locations.module.ts              # Module definition, TypeORM entity registration
│   │   ├── locations.controller.ts          # POST/GET/PATCH/DELETE /locations
│   │   ├── locations.service.ts             # Business logic + TreeRepository operations
│   │   ├── entities/
│   │   │   └── location.entity.ts           # TypeORM entity — adjacency-list tree
│   │   └── dto/
│   │       ├── create-location.dto.ts       # Validated input for location creation
│   │       └── update-location.dto.ts       # Partial update DTO (all fields optional)
│   │
│   ├── bookings/
│   │   ├── bookings.module.ts               # Module definition, injects LocationsModule
│   │   ├── bookings.controller.ts           # POST/GET /bookings, GET /bookings/:id
│   │   ├── bookings.service.ts              # Booking creation with 4-step rule enforcement
│   │   ├── entities/
│   │   │   └── booking.entity.ts            # TypeORM entity — ManyToOne to Location
│   │   └── dto/
│   │       └── create-booking.dto.ts        # Validated booking input with ISO 8601 dates
│   │
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts     # Global filter — structured error response + structured logging
│   │   └── utils/
│   │       ├── open-time.parser.ts          # Parses openTime strings and checks datetime windows
│   │       └── open-time.parser.spec.ts     # Unit tests for the parser
│   │
│   ├── database/
│   │   └── seed.ts                          # Standalone seed script (npm run seed)
│   │
│   ├── locations/
│   │   └── locations.service.spec.ts        # Unit tests for LocationsService
│   └── bookings/
│       └── bookings.service.spec.ts         # Unit tests for BookingsService
│
├── docker-compose.yml                       # PostgreSQL 16 container
├── .env.example                             # Environment variable template
├── package.json                             # Scripts, dependencies
├── tsconfig.json                            # TypeScript configuration
└── README.md                                # This file
```
