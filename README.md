<p align="center">
  <a href="https://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

# Buildings & Grounds Management System - Backend API

A comprehensive NestJS backend API for managing buildings and grounds maintenance operations, including work requests, asset management, inventory, stock movements, and maintenance scheduling.

## Features

- **Authentication & Authorization** - JWT-based auth with role-based access control
- **Work Request Management** - Create, approve, and track maintenance work requests with priority levels
- **Asset Management** - Track and transfer assets across locations with approval workflows
- **Inventory Control** - Manage stock inventory with categories and stock movements
- **Maintenance Scheduling** - Schedule and track maintenance tasks with time-based and run-hours-based intervals
- **Maintenance Profiles** - Configure default maintenance intervals per asset type
- **Project Tracking** - Manage maintenance and improvement projects
- **Budget Management** - Track budgets and financial transactions
- **Reporting** - Generate reports for various system operations
- **Notifications** - Real-time notifications for system events
- **Purchase & Borrow Requests** - Handle procurement and equipment borrowing workflows

## Modules

| Module | Description |
|--------|-------------|
| `auth` | Authentication and authorization |
| `inventory` | Inventory management |
| `work-requests` | Maintenance work request workflows |
| `asset-transfers` | Asset transfer approvals and tracking |
| `stock-movements` | Stock movement tracking |
| `maintenance-schedules` | Scheduled maintenance tasks |
| `maintainable-asset-profiles` | Asset maintenance configuration profiles |
| `asset-type-configs` | Asset type-specific settings |
| `maintenance-unit-type-configs` | Maintenance unit type configurations |
| `projects` | Project management |
| `budget` | Budget tracking and transactions |
| `purchase-requests` | Purchase request workflows |
| `borrow-requests` | Equipment borrowing workflows |
| `notifications` | System notifications |
| `reports` | Report generation |
| `persons` | Person/employee management |
| `offices` | Office/location management |
| `positions` | Position/role definitions |
| `categories` | Categorization system |
| `roles` | Role permissions |

## Tech Stack

- **Framework:** NestJS (Node.js)
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT
- **API Documentation:** Swagger/OpenAPI (via `@nestjs/swagger`)

## Project setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

## Compile and run the project

```bash
# development
npm run start

# watch mode (with hot reload)
npm run start:dev

# production mode
npm run start:prod
```

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## API Documentation

When the server is running, access the Swagger API documentation at:

```
http://localhost:3000/api/docs
```

## Database

### Prisma Commands

```bash
# Push schema changes to database
npx prisma db push

# Create a migration
npx prisma migrate dev

# Apply migrations
npx prisma migrate deploy

# Open Prisma Studio (database GUI)
npx prisma studio
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_EXPIRATION` | JWT token expiration time | No |
| `PORT` | Server port (default: 3000) | No |

## Project Structure

```
src/
├── app.module.ts           # Root module
├── main.ts                 # Application entry point
├── auth/                   # Authentication module
├── inventory/              # Inventory management
├── work-requests/          # Work request workflows
├── asset-transfers/        # Asset transfer module
├── stock-movements/        # Stock movement tracking
├── maintenance-schedules/  # Maintenance scheduling
├── maintainable-asset-profile/  # Asset maintenance profiles
├── asset-type-configs/      # Asset type configurations
├── maintenanc-unit-type-configs/ # Maintenance unit configs
├── projects/               # Project management
├── budget/                 # Budget management
├── purchase-requests/      # Purchase workflows
├── borrow-requests/        # Borrow workflows
├── notifications/          # Notifications
├── reports/                # Reporting
├── persons/                 # Person management
├── offices/                 # Office management
├── positions/               # Position definitions
├── categories/             # Categories
├── roles/                   # Role permissions
└── gateway/                 # WebSocket gateway
```

## License

MIT
