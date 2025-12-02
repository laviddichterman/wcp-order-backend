# NestJS Migration Plan: wcp-order-backend → wario-backend

## Executive Summary

This document outlines the migration strategy for transitioning `wcp-order-backend` (Express.js + Socket.IO) to `wario-backend` (NestJS). The migration prioritizes **zero-disruption compatibility** with existing client applications while establishing a foundation for future modernization.

**Migration Philosophy**:
- **Reuse code verbatim** where possible (models, business logic, utilities)
- **Use NestJS CLI** to scaffold structure
- **Maintain identical API contracts** (REST endpoints, Socket.IO events, MongoDB schemas)
- **Defer modernization** to post-migration phase

**Target**: `wario-backend` at `/Users/lavid/Documents/wario-monorepo/apps/wario-backend`

---

## Migration Phases

### Phase 0: Prerequisites ✓

**Status**: wario-backend already scaffolded with basic NestJS structure

**Verified**:
- ✓ NestJS CLI installed
- ✓ Basic project structure created
- ✓ TypeScript configured
- ✓ package.json with NestJS dependencies

---

## Phase 1: Project Setup & Dependencies

### 1.1 Install Required Packages

Add all dependencies from wcp-order-backend to wario-backend:

```bash
cd /Users/lavid/Documents/wario-monorepo

# NestJS-specific packages
pnpm add @nestjs/mongoose @nestjs/platform-socket.io @nestjs/passport @nestjs/jwt passport passport-jwt jwks-rsa --filter @wcp/wario-backend

# Existing dependencies (carry over from wcp-order-backend)
pnpm add @wcp/wario-shared@^0.4.1 mongoose@^6.13.8 socket.io@^4.8.1 --filter @wcp/wario-backend

# External integrations
pnpm add @googlemaps/google-maps-services-js@^3.4.2 googleapis@^164.1.0 google-auth-library@^10.5.0 square@^39.1.1 --filter @wcp/wario-backend

# Utilities
pnpm add @date-fns/utc@^2.1.1 date-fns@^4.1.0 @turf/turf@^7.3.0 @turf/invariant@^7.3.0 --filter @wcp/wario-backend
pnpm add class-transformer@^0.5.1 class-validator@^0.14.2 --filter @wcp/wario-backend
pnpm add dotenv@^17.2.3 cors@^2.8.5 --filter @wcp/wario-backend
pnpm add nodemailer@^6.10.1 qrcode@^1.5.4 voucher-code-generator@^1.3.0 --filter @wcp/wario-backend
pnpm add json-bigint@^1.0.0 es-toolkit@^1.42.0 --filter @wcp/wario-backend

# Dev dependencies
pnpm add -D @types/nodemailer@^6.4.20 @types/qrcode@^1.5.5 @types/json-bigint@^1.0.4 @types/voucher-code-generator@^1.1.3 --filter @wcp/wario-backend
```

**Note**: Some packages will be replaced or removed:
- ❌ `express-validator` → ✅ `class-validator` (already in NestJS)
- ❌ `express-oauth2-jwt-bearer` → ✅ `@nestjs/passport` + `passport-jwt`
- ❌ `express-idempotency` → ✅ Order locking via MongoDB (see Phase 8.4)
- ❌ `express-winston` → ✅ NestJS built-in logger (configure later)
- ❌ `bluebird` → ✅ Native ES6 Promises (see Phase 3.6)

> [!WARNING]
> **Bluebird Removal**: The `bluebird` promise library can cause issues with NestJS's dependency injection and async handling. All `Promise.map`, `Promise.mapSeries`, and other Bluebird-specific methods must be replaced with native ES6 Promise methods or async/await patterns during migration.

### 1.2 Environment Configuration

Create `.env` file in wario-backend root:

```bash
# Copy from wcp-order-backend/.env
cp /Users/lavid/Documents/wario-monorepo/apps/wcp-order-backend/.env /Users/lavid/Documents/wario-monorepo/apps/wario-backend/.env
```

Update `src/main.ts` to load environment variables:

```typescript
import { config } from 'dotenv';
config(); // Load .env before anything else

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Port configuration
  const PORT = process.env.PORT || 4001;
  await app.listen(PORT);
  console.log(`Application listening on port ${PORT}`);
}
bootstrap();
```

### 1.3 Project Structure

Create directory structure matching wcp-order-backend organization:

```bash
cd src

# Create directories
mkdir -p config controllers models/{orders,catalog/{products,options,category},settings,payment,query} middleware types utils

# Keep NestJS conventions
# - config/ → services that correspond to providers
# - controllers/ → NestJS controllers
# - models/ → Mongoose schemas (reuse verbatim)
```

**Directory Mapping**:

| wcp-order-backend | wario-backend | Notes |
|-------------------|---------------|-------|
| `src/config/` | `src/config/` | Providers → NestJS Services |
| `src/controllers/` | `src/controllers/` | Express Controllers → NestJS Controllers |
| `src/models/` | `src/models/` | **Copy verbatim** (Mongoose schemas) |
| `src/middleware/` | `src/middleware/` or guards/interceptors | Map to NestJS equivalents |
| `src/types/` | `src/types/` | **Copy verbatim** (TypeScript interfaces) |
| `src/utils.ts` | `src/utils/` | **Copy verbatim** (utility functions) |
| `src/logging.ts` | Use NestJS Logger | Replace with built-in |

---

## Phase 2: MongoDB & Mongoose Integration

### 2.1 Configure Mongoose Module

Update `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const DBTABLE = process.env.DBTABLE || '';
        const DBUSER = process.env.DBUSER || undefined;
        const DBPASS = process.env.DBPASS || undefined;
        const DBENDPOINT = process.env.DBENDPOINT || '127.0.0.1:27017';
        
        return {
          uri: `mongodb://${DBENDPOINT}/${DBTABLE}`,
          user: DBUSER,
          pass: DBPASS,
        };
      },
    }),
  ],
})
export class AppModule {}
```

### 2.2 Copy Mongoose Models

**Action**: Copy all model files from wcp-order-backend verbatim:

```bash
cd /Users/lavid/Documents/wario-monorepo/apps/wario-backend

# Copy entire models directory
cp -r ../wcp-order-backend/src/models/* src/models/

# Files to copy:
# - models/WMoney.ts
# - models/IntervalSchema.ts
# - models/PrepTimingSchema.ts
# - models/RecurringIntervalSchema.ts
# - models/DBVersionSchema.ts
# - models/orders/* (all order-related schemas)
# - models/catalog/* (all catalog schemas)
# - models/settings/* (settings schemas)
# - models/payment/* (payment schemas)
# - models/query/* (query schemas)
```

**No modifications needed** - these schemas are framework-agnostic.

### 2.3 Create Mongoose Feature Modules

For each major schema, create a NestJS feature module:

```bash
nest generate module models/orders
nest generate module models/catalog
nest generate module models/settings
```

Example `src/models/orders/orders.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WOrderInstanceModel } from './WOrderInstance';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'WOrderInstance', schema: WOrderInstanceModel.schema }
    ])
  ],
  exports: [MongooseModule]
})
export class OrdersModule {}
```

**Pattern**: Export MongooseModule to make schemas available to other modules.

---

## Phase 3: Provider Migration (Singleton Services)

All providers from wcp-order-backend will become NestJS Injectable services.

### 3.1 Copy Utility Code Verbatim

```bash
# Copy types directory
cp -r ../wcp-order-backend/src/types src/

# Copy utils.ts
cp ../wcp-order-backend/src/utils.ts src/utils/utils.ts

# Copy custom.d.ts if needed
cp ../wcp-order-backend/src/custom.d.ts src/
```

### 3.2 Migrate Providers to Services

For each provider in `wcp-order-backend/src/config/`:

| Provider | Action | Notes |
|----------|--------|-------|
| `database_manager.ts` | Convert to `@Injectable()` | Bootstrap via `OnModuleInit` |
| `dataprovider.ts` | Convert to `@Injectable()` | In-memory state management |
| `catalog_provider.ts` | Convert to `@Injectable()` | In-memory catalog cache |
| `socketio_provider.ts` | Convert to `@WebSocketGateway()` | See Phase 5 |
| `order_manager.ts` | Convert to `@Injectable()` | Business logic service |
| `google.ts` | Convert to `@Injectable()` | External API wrapper |
| `square.ts` | Convert to `@Injectable()` | External API wrapper |
| `store_credit_provider.ts` | Convert to `@Injectable()` | Payment service |
| `authorization.ts` | Convert to Guards | See Phase 6 |

### 3.3 Migration Pattern for Services

**Example**: Migrating `DataProvider` to NestJS service

**Original** (`wcp-order-backend/src/config/dataprovider.ts`):
```typescript
export class DataProvider implements WProvider {
  public Fulfillments: Record<string, FulfillmentConfig> = {};
  public Settings: IWSettings = ...;
  
  Bootstrap = async (app: WApp) => {
    // Load data from MongoDB
  }
}

export const DataProviderInstance = new DataProvider();
```

**Migrated** (`wario-backend/src/config/data-provider.service.ts`):
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class DataProviderService implements OnModuleInit {
  public Fulfillments: Record<string, FulfillmentConfig> = {};
  public Settings: IWSettings = ...;
  
  constructor(
    @InjectModel('FulfillmentSchema') private fulfillmentModel: Model<FulfillmentConfig>,
    @InjectModel('WSettingsSchema') private settingsModel: Model<IWSettings>,
  ) {}
  
  async onModuleInit() {
    // Bootstrap logic (formerly Bootstrap method)
    await this.loadFulfillments();
    await this.loadSettings();
  }
  
  // Copy rest of methods verbatim from DataProvider
  async loadFulfillments() { ... }
  async syncFulfillments() { ... }
  // ... etc
}
```

**Key Changes**:
1. Add `@Injectable()` decorator
2. Implement `OnModuleInit` for bootstrap logic
3. Use `@InjectModel()` for Mongoose models
4. Remove singleton export pattern (NestJS handles DI)
5. **Keep all business logic identical**

### 3.4 Create Config Module

```bash
nest generate module config
nest generate service config/data-provider
nest generate service config/catalog-provider
nest generate service config/order-manager
nest generate service config/google
nest generate service config/square
nest generate service config/store-credit-provider
nest generate service config/database-manager
```

`src/config/config.module.ts`:
```typescript
import { Module, Global } from '@nestjs/common';
import { DataProviderService } from './data-provider.service';
import { CatalogProviderService } from './catalog-provider.service';
// ... import all services

@Global() // Make these services available globally (matches singleton pattern)
@Module({
  providers: [
    DataProviderService,
    CatalogProviderService,
    OrderManagerService,
    GoogleService,
    SquareService,
    StoreCreditProviderService,
    DatabaseManagerService,
  ],
  exports: [
    DataProviderService,
    CatalogProviderService,
    OrderManagerService,
    GoogleService,
    SquareService,
    StoreCreditProviderService,
    DatabaseManagerService,
  ],
})
export class ConfigModule {}
```

**Import ConfigModule in AppModule** to make services globally available.

### 3.5 Copy Business Logic Files

For each service, copy the original file and apply the pattern above:

```bash
# Copy files to src/config/ and then convert
cp ../wcp-order-backend/src/config/dataprovider.ts src/config/data-provider.service.ts
cp ../wcp-order-backend/src/config/catalog_provider.ts src/config/catalog-provider.service.ts
cp ../wcp-order-backend/src/config/order_manager.ts src/config/order-manager.service.ts
cp ../wcp-order-backend/src/config/google.ts src/config/google.service.ts
cp ../wcp-order-backend/src/config/square.ts src/config/square.service.ts
cp ../wcp-order-backend/src/config/store_credit_provider.ts src/config/store-credit-provider.service.ts
cp ../wcp-order-backend/src/config/database_manager.ts src/config/database-manager.service.ts
cp ../wcp-order-backend/src/config/SquareWarioBridge.ts src/config/square-wario-bridge.ts
cp ../wcp-order-backend/src/config/crypto-aes-256-gcm.ts src/config/crypto-aes-256-gcm.ts
```

Then manually apply NestJS patterns (Injectable, constructor injection, lifecycle hooks).

### 3.6 Remove Bluebird Promises

> [!CAUTION]
> **Critical Migration Step**: Bluebird must be completely removed as it can interfere with NestJS's async handling.

**Bluebird Usage in wcp-order-backend**:
- `Promise.map()` - Used in `database_manager.ts` for parallel migrations
- `Promise.mapSeries()` - Used for sequential async operations
- Other Bluebird utilities

**Replacement Strategies**:

1. **`Promise.map()` → `Promise.all()` + `Array.map()`**

```typescript
// Before (Bluebird)
import * as Promise from 'bluebird';
const results = await Promise.map(items, async (item) => processItem(item));

// After (Native)
const results = await Promise.all(items.map(async (item) => processItem(item)));
```

2. **`Promise.mapSeries()` → `for...of` loop**

```typescript
// Before (Bluebird)
import * as Promise from 'bluebird';
const results = await Promise.mapSeries(items, async (item) => processItem(item));

// After (Native)
const results = [];
for (const item of items) {
  results.push(await processItem(item));
}
```

3. **`Promise.props()` → destructuring with `Promise.all()`**

```typescript
// Before (Bluebird)
const { users, orders } = await Promise.props({
  users: fetchUsers(),
  orders: fetchOrders()
});

// After (Native)
const [users, orders] = await Promise.all([
  fetchUsers(),
  fetchOrders()
]);
```

**Files Requiring Bluebird Removal**:
- `src/config/database_manager.ts` - Migration functions
- Any service using `Promise.map` or `Promise.mapSeries`

**Migration Checklist**:
- [ ] Search codebase for `import.*bluebird`
- [ ] Replace `Promise.map()` with `Promise.all()`
- [ ] Replace `Promise.mapSeries()` with `for...of` loops
- [ ] Replace `Promise.props()` with destructured `Promise.all()`
- [ ] Remove `bluebird` from imports
- [ ] Test all async operations for correct behavior

---

## Phase 4: Controller Migration

### 4.1 Controller Mapping Strategy

Each Express controller becomes a NestJS controller with identical routes.

**NestJS Controller Pattern**:

**Original Express** (`wcp-order-backend/src/controllers/OrderController.ts`):
```typescript
export class OrderController implements IExpressController {
  public path = "/api/v1/order";
  public router = Router({ mergeParams: true });
  
  constructor() {
    this.initializeRoutes();
  }
  
  private initializeRoutes() {
    this.router.post(`${this.path}`, expressValidationMiddleware(...), this.postOrder);
    this.router.get(`${this.path}/:oId`, CheckJWT, ScopeReadOrders, ..., this.getOrder);
  }
  
  private postOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reqBody: CreateOrderRequestV2 = req.body;
      const response = await OrderManagerInstance.CreateOrder(reqBody, ...);
      res.status(response.status).json(response);
    } catch (error) {
      next(error);
    }
  }
}
```

**Migrated NestJS** (`wario-backend/src/controllers/order.controller.ts`):
```typescript
import { Controller, Post, Get, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Scopes } from '../decorators/scopes.decorator';
import { ScopesGuard } from '../guards/scopes.guard';
import { OrderManagerService } from '../config/order-manager.service';
import { CreateOrderRequestV2 } from '@wcp/wario-shared';

@Controller('api/v1/order')
export class OrderController {
  constructor(private readonly orderManager: OrderManagerService) {}
  
  @Post()
  async postOrder(@Body() reqBody: CreateOrderRequestV2, @Req() req) {
    const ipAddress = req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '';
    const response = await this.orderManager.CreateOrder(reqBody, ipAddress);
    return response; // NestJS auto-serializes to JSON with proper status
  }
  
  @Get(':oId')
  @UseGuards(JwtAuthGuard, ScopesGuard)
  @Scopes('read:orders')
  async getOrder(@Param('oId') oId: string) {
    const response = await this.orderManager.GetOrder(oId);
    if (!response) {
      throw new NotFoundException();
    }
    return response;
  }
  
  // ... other methods
}
```

**Key Changes**:
1. Use NestJS decorators: `@Controller()`, `@Post()`, `@Get()`, `@Put()`, etc.
2. Constructor injection for services (e.g., `OrderManagerService`)
3. Use `@UseGuards()` for authentication/authorization (replaces middleware)
4. Use `@Body()`, `@Param()`, `@Query()` decorators
5. **Business logic stays identical** - just calls the same service methods

### 4.2 Generate Controllers

```bash
cd /Users/lavid/Documents/wario-monorepo/apps/wario-backend

nest generate controller controllers/order --no-spec
nest generate controller controllers/product --no-spec
nest generate controller controllers/modifier --no-spec
nest generate controller controllers/category --no-spec
nest generate controller controllers/fulfillment --no-spec
nest generate controller controllers/settings --no-spec
nest generate controller controllers/store-credit --no-spec
nest generate controller controllers/accounting --no-spec
nest generate controller controllers/delivery-address --no-spec
nest generate controller controllers/key-value-store --no-spec
nest generate controller controllers/product-instance-function --no-spec
nest generate controller controllers/printer-group --no-spec
nest generate controller controllers/seating-resource --no-spec
```

### 4.3 Controller-by-Controller Migration

For each controller:

1. **Copy original file** as reference
2. **Map routes** to NestJS decorators
3. **Inject services** via constructor
4. **Copy method bodies verbatim** (business logic)
5. **Replace validation** (see Phase 7)
6. **Add guards** for authentication (see Phase 6)

**File Mapping**:

| wcp-order-backend | wario-backend |
|-------------------|---------------|
| `OrderController.ts` | `order.controller.ts` |
| `ProductController.ts` | `product.controller.ts` |
| `ModifierController.ts` | `modifier.controller.ts` |
| `CategoryController.ts` | `category.controller.ts` |
| `FulfillmentController.ts` | `fulfillment.controller.ts` |
| `SettingsController.ts` | `settings.controller.ts` |
| `StoreCreditController.ts` | `store-credit.controller.ts` |
| `AccountingController.ts` | `accounting.controller.ts` |
| `DeliveryAddressController.ts` | `delivery-address.controller.ts` |
| `KeyValueStoreController.ts` | `key-value-store.controller.ts` |
| `ProductInstanceFunctionController.ts` | `product-instance-function.controller.ts` |
| `PrinterGroupController.ts` | `printer-group.controller.ts` |
| `SeatingResourceController.ts` | `seating-resource.controller.ts` (if exists) |

### 4.4 Create Controllers Module

`src/controllers/controllers.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { ProductController } from './product.controller';
// ... import all controllers

@Module({
  controllers: [
    OrderController,
    ProductController,
    ModifierController,
    CategoryController,
    FulfillmentController,
    SettingsController,
    StoreCreditController,
    AccountingController,
    DeliveryAddressController,
    KeyValueStoreController,
    ProductInstanceFunctionController,
    PrinterGroupController,
  ],
})
export class ControllersModule {}
```

Import in `AppModule`.

---

## Phase 5: Socket.IO Integration

### 5.1 Install Socket.IO Platform

```bash
npm install @nestjs/platform-socket.io
```

### 5.2 Configure Socket.IO in AppModule

Update `src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for Socket.IO
  app.enableCors({
    origin: [
      /https:\/\/.*\.windycitypie\.com$/,
      /https:\/\/windycitypie\.com$/,
      /https:\/\/.*\.breezytownpizza\.com$/,
      /https:\/\/breezytownpizza\.com$/,
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3003',
      `http://localhost:${process.env.PORT || 4001}`,
    ],
    credentials: true,
  });
  
  app.useWebSocketAdapter(new IoAdapter(app));
  
  await app.listen(process.env.PORT || 4001);
}
bootstrap();
```

### 5.3 Create Socket.IO Gateway

```bash
nest generate gateway socket-io/read-only --no-spec
```

**Migrate** `SocketIoProvider` to Gateway:

`src/socket-io/read-only.gateway.ts`:
```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket, Namespace } from 'socket.io';
import { format } from 'date-fns';
import { WDateUtils } from '@wcp/wario-shared';
import { DataProviderService } from '../config/data-provider.service';
import { CatalogProviderService } from '../config/catalog-provider.service';

@WebSocketGateway({
  namespace: 'nsRO',
  cors: {
    origin: [
      /https:\/\/.*\.windycitypie\.com$/,
      /https:\/\/windycitypie\.com$/,
      /https:\/\/.*\.breezytownpizza\.com$/,
      /https:\/\/breezytownpizza\.com$/,
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3003',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ReadOnlyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;
  
  private clientCount = 0;
  
  constructor(
    private readonly dataProvider: DataProviderService,
    private readonly catalogProvider: CatalogProviderService,
  ) {}
  
  handleConnection(socket: Socket) {
    ++this.clientCount;
    const connectTime = Date.now();
    
    // Log connection (copy from original)
    console.log(`CONNECTION: Client connected. Num Connected: ${this.clientCount}`);
    
    // Emit initial state (copy exact events from original)
    socket.emit('WCP_SERVER_TIME', {
      time: format(connectTime, WDateUtils.ISODateTimeNoOffset),
      tz: process.env.TZ!,
    });
    this.emitFulfillmentsTo(socket);
    this.emitSettingsTo(socket);
    this.emitCatalogTo(socket);
    this.emitSeatingResourcesTo(socket);
  }
  
  handleDisconnect(socket: Socket) {
    --this.clientCount;
    console.log(`DISCONNECT. Num Connected: ${this.clientCount}`);
  }
  
  // Copy methods from SocketIoProvider verbatim
  emitFulfillmentsTo(dest: Socket | Namespace) {
    return dest.emit('WCP_FULFILLMENTS', this.dataProvider.Fulfillments);
  }
  
  emitFulfillments() {
    return this.emitFulfillmentsTo(this.server);
  }
  
  emitSettingsTo(dest: Socket | Namespace) {
    return dest.emit('WCP_SETTINGS', this.dataProvider.Settings);
  }
  
  emitSettings() {
    return this.emitSettingsTo(this.server);
  }
  
  emitCatalogTo(dest: Socket | Namespace) {
    return dest.emit('WCP_CATALOG', this.catalogProvider.Catalog);
  }
  
  emitCatalog() {
    return this.emitCatalogTo(this.server);
  }
  
  emitSeatingResourcesTo(dest: Socket | Namespace) {
    return dest.emit('WCP_SEATING_RESOURCES', this.dataProvider.SeatingResources);
  }
  
  emitSeatingResources() {
    return this.emitSeatingResourcesTo(this.server);
  }
}
```

**Pattern**: Copy event emission logic verbatim, wrap in NestJS Gateway decorators.

### 5.4 Inject Gateway into Services

Services that need to broadcast (e.g., `CatalogProviderService`) should inject the gateway:

```typescript
@Injectable()
export class CatalogProviderService {
  constructor(
    @Inject(forwardRef(() => ReadOnlyGateway))
    private readonly socketGateway: ReadOnlyGateway,
  ) {}
  
  async createProduct(...) {
    // ... create product logic
    
    // Broadcast update
    this.socketGateway.emitCatalog();
  }
}
```

Use `forwardRef()` to avoid circular dependencies.

---

## Phase 6: Authentication & Authorization

### 6.1 Install Passport Dependencies

```bash
npm install @nestjs/passport passport passport-jwt jwks-rsa
npm install -D @types/passport-jwt
```

### 6.2 Create JWT Strategy

`src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${process.env.AUTH0_ISSUER_URL}.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: process.env.AUTH0_AUDIENCE,
      issuer: process.env.AUTH0_ISSUER_URL,
      algorithms: ['RS256'],
    });
  }
  
  async validate(payload: any) {
    return { userId: payload.sub, permissions: payload.permissions };
  }
}
```

### 6.3 Create Auth Guards

**JWT Guard** (`src/guards/jwt-auth.guard.ts`):
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**Scopes Guard** (`src/guards/scopes.guard.ts`):
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.get<string[]>('scopes', context.getHandler());
    if (!requiredScopes) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    return requiredScopes.every(scope => user.permissions?.includes(scope));
  }
}
```

### 6.4 Create Scopes Decorator

`src/decorators/scopes.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const Scopes = (...scopes: string[]) => SetMetadata('scopes', scopes);
```

### 6.5 Create Auth Module

```bash
nest generate module auth
```

`src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // Config handled in strategy
  ],
  providers: [JwtStrategy],
  exports: [JwtStrategy],
})
export class AuthModule {}
```

### 6.6 Apply Guards to Controllers

Example usage in controllers:

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ScopesGuard } from '../guards/scopes.guard';
import { Scopes } from '../decorators/scopes.decorator';

@Controller('api/v1/order')
export class OrderController {
  @Get(':oId')
  @UseGuards(JwtAuthGuard, ScopesGuard)
  @Scopes('read:orders')
  async getOrder(@Param('oId') oId: string) {
    // ...
  }
  
  @Put(':oId/cancel')
  @UseGuards(JwtAuthGuard, ScopesGuard)
  @Scopes('cancel:orders')
  async cancelOrder(@Param('oId') oId: string, @Body() body: any) {
    // ...
  }
}
```

**Scope Mapping** (from wcp-order-backend authorization.ts):
- `read:orders`
- `write:orders`
- `cancel:orders`
- `write:catalog`
- `delete:catalog`
- `write:kvstore`
- `write:orderconfig`
- `edit:credit`

---

## Phase 7: Validation Migration

### 7.1 Replace express-validator with class-validator

NestJS uses `class-validator` + `class-transformer` via DTOs.

### 7.2 Create DTOs from wario-shared Types

**Pattern**: Create DTO classes that extend/implement `wario-shared` types.

**Example**: Order Creation DTO

`src/dto/create-order.dto.ts`:
```typescript
import { IsArray, IsEmail, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { 
  CreateOrderRequestV2, 
  WFulfillmentStatus, 
  DiscountMethod, 
  TenderBaseStatus, 
  PaymentMethod,
  CURRENCY 
} from '@wcp/wario-shared';

class FulfillmentDto {
  @IsEnum(WFulfillmentStatus)
  status: WFulfillmentStatus;
  
  @IsMongoId()
  selectedService: string;
  
  @IsString()
  selectedDate: string;
  
  @IsInt()
  @Min(0)
  @Max(1440)
  selectedTime: number;
}

class CustomerInfoDto {
  @IsNotEmpty()
  @IsString()
  givenName: string;
  
  @IsNotEmpty()
  @IsString()
  familyName: string;
  
  @IsNotEmpty()
  @IsString()
  mobileNum: string;
  
  @IsEmail()
  email: string;
  
  @IsOptional()
  @IsString()
  referral?: string;
}

// ... define other nested DTOs

export class CreateOrderDto implements CreateOrderRequestV2 {
  @ValidateNested()
  @Type(() => FulfillmentDto)
  fulfillment: FulfillmentDto;
  
  @ValidateNested()
  @Type(() => CustomerInfoDto)
  customerInfo: CustomerInfoDto;
  
  @IsArray()
  cart: any[]; // TODO: define CartEntryDto
  
  @IsArray()
  proposedDiscounts: any[];
  
  @IsArray()
  proposedPayments: any[];
  
  @ValidateNested()
  tip: any;
  
  @IsOptional()
  @IsString()
  specialInstructions?: string;
  
  @IsOptional()
  metrics?: any;
}
```

### 7.3 Enable Global Validation Pipe

Update `src/main.ts`:

```typescript
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  // ... rest of setup
}
```

### 7.4 Use DTOs in Controllers

```typescript
@Post()
async postOrder(@Body() createOrderDto: CreateOrderDto, @Req() req) {
  // DTO is automatically validated by ValidationPipe
  const ipAddress = req.headers['x-real-ip'] ?? ...;
  return this.orderManager.CreateOrder(createOrderDto, ipAddress);
}
```

### 7.5 DTO Creation Strategy

**Priority Order**:
1. **Phase 1**: Create DTOs for order creation (most critical)
2. **Phase 2**: Create DTOs for catalog mutations (products, modifiers, categories)
3. **Phase 3**: Create DTOs for configuration endpoints
4. **Defer**: Complex nested DTOs can be created incrementally

**Reuse Principle**: Where validation rules match wario-shared types exactly, just use type annotations without creating full DTOs.

---

## Phase 8: Middleware & Interceptors

### 8.1 CORS Configuration

Already handled in `main.ts` (see Phase 5.2).

### 8.2 Logging

Replace express-winston with NestJS Logger:

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class OrderManagerService {
  private readonly logger = new Logger(OrderManagerService.name);
  
  async createOrder(...) {
    this.logger.log('Creating order...');
    // ...
  }
}
```

**Note**: For production logging, integrate Winston through NestJS logger later.

### 8.3 Idempotency Header Validation

Create a custom validation decorator for idempotency-key header:

`src/decorators/idempotency-key.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const IdempotencyKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const key = request.headers['idempotency-key'];
    
    if (!key) {
      throw new BadRequestException('idempotency-key header is required');
    }
    
    return key;
  },
);
```

**Usage**:
```typescript
@Put(':oId/cancel')
async cancelOrder(
  @IdempotencyKey() idempotencyKey: string,
  @Param('oId') orderId: string,
  @Body() body: CancelOrderDto
) {
  // idempotencyKey is now validated and extracted
}
```

### 8.4 Error Handling

NestJS has built-in exception filters. Create custom filter for wcp-order-backend error patterns:

`src/filters/http-exception.filter.ts`:
```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    
    response.status(status).json({
      statusCode: status,
      message: exception.message,
    });
  }
}
```

Apply globally in `main.ts`:
```typescript
app.useGlobalFilters(new HttpExceptionFilter());
```

### 8.4 Order Idempotency Implementation

> [!IMPORTANT]
> Idempotency for order mutations is **critical for deployment** and must be implemented during migration.

#### Current Implementation Analysis

The wcp-order-backend uses a **MongoDB-based locking mechanism** for order idempotency:

1. **`express-idempotency` middleware** is registered globally but **not actually used**
2. **Real idempotency** uses the `locked` field on `WOrderInstance`
3. All order mutations (cancel, confirm, send, reschedule, move) use `LockAndActOnOrder` pattern
4. The `idempotency-key` header is passed as the lock value

**How it works** (from `order_manager.ts` line 570-591):

```typescript
private LockAndActOnOrder = async (
  idempotencyKey: string,
  orderId: string,
  testDbOrder: FilterQuery<WOrderInstance>,
  onSuccess: (order: WOrderInstance) => Promise<ResponseWithStatusCode<CrudOrderResponse>>
): Promise<ResponseWithStatusCode<CrudOrderResponse>> => {
  // Atomically lock the order with the idempotency key
  return await WOrderInstanceModel.findOneAndUpdate(
    { _id: orderId, locked: null, ...testDbOrder },  // Only update if not locked
    { locked: idempotencyKey },                       // Set lock to idempotency key
    { new: true }
  ).then(async (order) => {
    if (!order) {
      return { status: 404, error: 'Order not found/locked' };
    }
    return await onSuccess(order.toObject());
  });
}
```

**Key Points**:
- Uses MongoDB's atomic `findOneAndUpdate` to prevent race conditions
- If order is already locked, returns 404 (prevents duplicate operations)
- After successful operation, lock is released (set to `null`)
- Idempotency key is just used as a lock identifier

#### NestJS Migration Strategy

**Option A: Decorator + Interceptor** (Recommended)

Create a custom decorator and interceptor that mimics the current behavior:

`src/decorators/lock-order.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const LOCK_ORDER_KEY = 'lock_order';
export const LockOrder = () => SetMetadata(LOCK_ORDER_KEY, true);
```

`src/interceptors/order-lock.interceptor.ts`:
```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WOrderInstance } from '../models/orders/WOrderInstance';
import { LOCK_ORDER_KEY } from '../decorators/lock-order.decorator';

@Injectable()
export class OrderLockInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @InjectModel('WOrderInstance') private orderModel: Model<WOrderInstance>,
  ) {}
  
  async intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const requiresLock = this.reflector.get<boolean>(LOCK_ORDER_KEY, context.getHandler());
    
    if (!requiresLock) {
      return next.handle();
    }
    
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];
    const orderId = request.params.oId;
    
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header required');
    }
    
    // Attempt to lock the order
    const order = await this.orderModel.findOneAndUpdate(
      { _id: orderId, locked: null },
      { locked: idempotencyKey },
      { new: true }
    ).exec();
    
    if (!order) {
      throw new NotFoundException('Order not found or already locked');
    }
    
    // Attach order and idempotency key to request for use in controller
    request.lockedOrder = order.toObject();
    request.idempotencyKey = idempotencyKey;
    
    return next.handle();
  }
}
```

**Usage in OrderController**:

```typescript
import { UseInterceptors } from '@nestjs/common';
import { OrderLockInterceptor } from '../interceptors/order-lock.interceptor';
import { LockOrder } from '../decorators/lock-order.decorator';

@Controller('api/v1/order')
export class OrderController {
  @Put(':oId/cancel')
  @UseGuards(JwtAuthGuard, ScopesGuard)
  @Scopes('cancel:orders')
  @UseInterceptors(OrderLockInterceptor)
  @LockOrder()
  async cancelOrder(
    @Param('oId') oId: string,
    @Req() req,
    @Body() body: CancelOrderDto
  ) {
    // req.lockedOrder is the locked order
    // req.idempotencyKey is the idempotency key
    return this.orderManager.CancelLockedOrder(
      req.lockedOrder,
      body.reason,
      body.emailCustomer,
      body.refundToOriginalPayment
    );
  }
}
```

**Option B: Guard-based Approach**

Alternatively, create a guard that handles locking:

`src/guards/order-lock.guard.ts`:
```typescript
import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WOrderInstance } from '../models/orders/WOrderInstance';

@Injectable()
export class OrderLockGuard implements CanActivate {
  constructor(
    @InjectModel('WOrderInstance') private orderModel: Model<WOrderInstance>,
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];
    const orderId = request.params.oId;
    
    if (!idempotencyKey || !orderId) {
      return false;
    }
    
    const order = await this.orderModel.findOneAndUpdate(
      { _id: orderId, locked: null },
      { locked: idempotencyKey },
      { new: true }
    ).exec();
    
    if (!order) {
      throw new NotFoundException('Order not found or already locked');
    }
    
    request.lockedOrder = order.toObject();
    request.idempotencyKey = idempotencyKey;
    
    return true;
  }
}
```

#### Implementation Checklist

- [ ] Create `@LockOrder()` decorator
- [ ] Create `OrderLockInterceptor` or `OrderLockGuard`
- [ ] Apply to all order mutation endpoints:
  - [ ] `PUT /api/v1/order/:oId/cancel`
  - [ ] `PUT /api/v1/order/:oId/confirm`
  - [ ] `PUT /api/v1/order/:oId/send`
  - [ ] `PUT /api/v1/order/:oId/move`
  - [ ] `PUT /api/v1/order/:oId/reschedule`
- [ ] Update `OrderManagerService` methods to accept `lockedOrder` parameter
- [ ] Ensure lock is released after operation (in service methods)
- [ ] Add validation for `idempotency-key` header in DTOs
- [ ] Test concurrent requests with same idempotency key (should return 404)

#### Lock Release Pattern

All order mutation methods must release the lock after completion:

```typescript
// In OrderManagerService
async cancelLockedOrder(lockedOrder: WOrderInstance, ...): Promise<CrudOrderResponse> {
  try {
    // ... perform cancellation logic
    
    // Release lock and update order
    return await this.orderModel.findOneAndUpdate(
      { locked: lockedOrder.locked, _id: lockedOrder.id },
      { 
        locked: null,  // Release lock
        status: WOrderStatus.CANCELED,
        // ... other updates
      },
      { new: true }
    );
  } catch (error) {
    // Release lock on error
    await this.orderModel.findOneAndUpdate(
      { _id: lockedOrder.id },
      { locked: null }
    );
    throw error;
  }
}
```

#### Testing Idempotency

**Test Case 1: Concurrent Requests**
```typescript
it('should prevent duplicate cancellations with same idempotency key', async () => {
  const idempotencyKey = 'test-key-123';
  const orderId = 'some-order-id';
  
  // First request should succeed
  const response1 = request(app.getHttpServer())
    .put(`/api/v1/order/${orderId}/cancel`)
    .set('idempotency-key', idempotencyKey)
    .send({ reason: 'test', emailCustomer: false });
  
  // Second request with same key should fail (order already locked)
  const response2 = request(app.getHttpServer())
    .put(`/api/v1/order/${orderId}/cancel`)
    .set('idempotency-key', idempotencyKey)
    .send({ reason: 'test', emailCustomer: false });
  
  const [res1, res2] = await Promise.all([response1, response2]);
  
  expect(res1.status).toBe(200);
  expect(res2.status).toBe(404); // Already locked
});
```

**Recommendation**: Use **Option A (Interceptor)** as it better separates concerns and makes the locking logic reusable across all order mutations.

---

## Phase 9: Testing Strategy

### 9.1 Unit Tests (Optional for Initial Migration)

**Recommendation**: Skip comprehensive unit tests during migration, focus on integration tests.

**Rationale**:
- Business logic is unchanged (copied verbatim)
- Integration tests provide better confidence for API compatibility

### 9.2 Integration Tests (Critical)

Test each controller endpoint to verify identical behavior.

**Example**: Order Controller Tests

`test/order.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('OrderController (e2e)', () => {
  let app: INestApplication;
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  it('POST /api/v1/order - should create order', () => {
    return request(app.getHttpServer())
      .post('/api/v1/order')
      .send({
        cart: [...],
        customerInfo: {...},
        fulfillment: {...},
        // ... complete order request
      })
      .expect(200);
  });
  
  it('GET /api/v1/order/:oId - should require authentication', () => {
    return request(app.getHttpServer())
      .get('/api/v1/order/507f1f77bcf86cd799439011')
      .expect(401);
  });
  
  // ... more tests
});
```

**Test Coverage**:
- ✅ All REST endpoints (13 controllers)
- ✅ Authentication/authorization guards
- ✅ Validation (DTO errors)
- ✅ Error responses match original

### 9.3 Socket.IO Tests

`test/socket-io.e2e-spec.ts`:
```typescript
import { io, Socket } from 'socket.io-client';

describe('Socket.IO Gateway (e2e)', () => {
  let socket: Socket;
  
  beforeAll((done) => {
    socket = io('http://localhost:4001/nsRO', {
      transports: ['websocket'],
    });
    socket.on('connect', done);
  });
  
  afterAll(() => {
    socket.close();
  });
  
  it('should emit WCP_SERVER_TIME on connection', (done) => {
    socket.on('WCP_SERVER_TIME', (data) => {
      expect(data).toHaveProperty('time');
      expect(data).toHaveProperty('tz');
      done();
    });
  });
  
  it('should emit WCP_CATALOG on connection', (done) => {
    socket.on('WCP_CATALOG', (data) => {
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('modifiers');
      expect(data).toHaveProperty('products');
      done();
    });
  });
  
  // ... test all events
});
```

### 9.4 Manual Testing Checklist

After migration, manually verify:

- [ ] Client app (wario-fe-order) can connect and receive catalog
- [ ] Client can submit orders successfully
- [ ] POS app (wario-pos) can authenticate and query orders
- [ ] Real-time catalog updates broadcast to all clients
- [ ] Payment processing works (Square integration)
- [ ] Email confirmations send correctly

---

## Phase 10: Deployment & Migration

### 10.1 Environment Parity

Ensure wario-backend `.env` matches wcp-order-backend:

```bash
# Copy and verify
diff /path/to/wcp-order-backend/.env /path/to/wario-backend/.env
```

### 10.2 Database Migration (Zero-Downtime Strategy)

**Option A: Shared Database** (Recommended for initial migration)

1. Point wario-backend at **same MongoDB** as wcp-order-backend
2. Both services can run simultaneously
3. Incrementally shift traffic (use load balancer or feature flag)
4. Monitor for discrepancies
5. Fully cutover once verified

**Option B: Blue-Green Deployment**

1. Deploy wario-backend to staging
2. Run comprehensive integration tests
3. Deploy to production alongside wcp-order-backend
4. Switch traffic atomically
5. Keep wcp-order-backend on standby for rollback

### 10.3 Migration Checklist

**Pre-Migration**:
- [ ] All integration tests passing
- [ ] Manual testing completed
- [ ] Performance benchmarks acceptable
- [ ] Monitoring/logging configured
- [ ] Rollback plan documented

**During Migration**:
- [ ] Deploy wario-backend to production
- [ ] Verify health checks
- [ ] Test one endpoint from production
- [ ] Gradually shift traffic (10% → 50% → 100%)
- [ ] Monitor error rates, latency, WebSocket connections

**Post-Migration**:
- [ ] 100% traffic on wario-backend
- [ ] wcp-order-backend kept on standby for 48 hours
- [ ] Monitor for issues
- [ ] Decommission wcp-order-backend after confidence period

---

## File-by-File Migration Checklist

### Critical Path (Must Complete First)

- [ ] `src/models/` - Copy all schemas verbatim
- [ ] `src/types/` - Copy all type definitions
- [ ] `src/utils.ts` - Copy utility functions
- [ ] `src/config/data-provider.service.ts` - Migrate DataProvider
- [ ] `src/config/catalog-provider.service.ts` - Migrate CatalogProvider
- [ ] `src/config/order-manager.service.ts` - Migrate OrderManager
- [ ] `src/socket-io/read-only.gateway.ts` - Migrate Socket.IO
- [ ] `src/controllers/order.controller.ts` - Migrate OrderController
- [ ] `src/auth/jwt.strategy.ts` - Setup authentication

### Secondary (Can Be Incremental)

- [ ] `src/config/google.service.ts` - Migrate GoogleProvider
- [ ] `src/config/square.service.ts` - Migrate SquareProvider
- [ ] `src/config/store-credit-provider.service.ts` - Migrate StoreCreditProvider
- [ ] `src/config/database-manager.service.ts` - Migrate DatabaseManager
- [ ] All remaining controllers (product, modifier, category, etc.)

### Validation (Per Controller)

- [ ] Create DTOs for each endpoint
- [ ] Add class-validator decorators
- [ ] Test validation rules match original

---

## Risk Mitigation

### High-Risk Areas

1. **Payment Processing** (OrderManager + Square)
   - **Mitigation**: Extensive testing in staging with test payments
   - **Rollback**: Keep wcp-order-backend accessible

2. **Socket.IO Broadcasting**
   - **Mitigation**: Monitor WebSocket connection counts
   - **Rollback**: Clients should reconnect automatically

3. **Authentication/Authorization**
   - **Mitigation**: Test all protected endpoints with real JWT tokens
   - **Rollback**: Verify scope checks match exactly

4. **MongoDB Schema Compatibility**
   - **Mitigation**: Use same models verbatim, no schema changes
   - **Risk**: Very low (schemas are framework-agnostic)

### Testing Priorities

**P0 (Must Test)**:
- Order creation (payment flow)
- Order retrieval (authenticated)
- Socket.IO catalog broadcast
- JWT authentication

**P1 (Should Test)**:
- All catalog mutations (products, modifiers, categories)
- Store credit validation/spending
- Delivery address validation

**P2 (Nice to Test)**:
- Accounting reports
- Printer group routing
- Product instance functions

---

## Post-Migration Modernization Opportunities

**Future Enhancements** (defer to post-migration):

1. **Idempotency**: Implement custom NestJS interceptor
2. **Type Safety**: Migrate from Mongoose to TypeORM for better TypeScript integration
3. **Event Sourcing**: Add event logging for order state changes
4. **Microservices**: Split catalog and order services
5. **GraphQL**: Add GraphQL API alongside REST
6. **Caching**: Add Redis for catalog caching
7. **Queue System**: Add Bull for background jobs (emails, webhooks)
8. **Observability**: Integrate OpenTelemetry for distributed tracing

**Principle**: Get migration working first, modernize incrementally later.

---

## Summary

**Migration Steps**:

1. ✅ **Phase 0**: Verify wario-backend scaffold
2. **Phase 1**: Install dependencies, copy models/types/utils
3. **Phase 2**: Configure Mongoose, copy schemas verbatim
4. **Phase 3**: Migrate providers to services (apply Injectable pattern)
5. **Phase 4**: Migrate controllers (apply NestJS decorators)
6. **Phase 5**: Setup Socket.IO gateway
7. **Phase 6**: Configure JWT authentication + guards
8. **Phase 7**: Create DTOs for validation
9. **Phase 8**: Configure middleware/interceptors
10. **Phase 9**: Write integration tests
11. **Phase 10**: Deploy with rollback plan

**Success Criteria**:
- ✅ All REST endpoints respond identically
- ✅ Socket.IO events match exactly
- ✅ MongoDB schemas unchanged
- ✅ Client apps work without modification
- ✅ Integration tests pass
- ✅ Performance metrics acceptable

**Timeline Estimate**: 2-3 weeks for full migration with testing

**Next Steps**: Begin Phase 1 (dependencies) and create implementation plan artifact for user review.
