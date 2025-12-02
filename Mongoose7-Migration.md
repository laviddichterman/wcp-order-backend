# Migration Plan: Mongoose 6.x to 7.x

Based on analyzing your codebase, here's a detailed migration plan for upgrading from Mongoose 6.13.8 to Mongoose 7.x.

## 1. Breaking Changes to Address

### 1.1 **Removed `strictQuery` Option Default Change**
- In Mongoose 7, `strictQuery` defaults to `strict` (usually `true`) instead of `false`
- **Action**: Review all queries that filter by properties not in your schema

### 1.2 **Removed Callback Support**
- Mongoose 7 removes callback support for all async operations
- **Action**: Audit all Mongoose calls for callbacks and convert to async/await or Promises

### 1.3 **`ObjectId` Requires `new` Keyword**
- `mongoose.Types.ObjectId()` now requires `new`
- **Action**: Search for `Types.ObjectId()` calls and add `new` keyword

### 1.4 **Removed `remove()` Method**
- `Document.prototype.remove()` is removed
- **Action**: Replace with `deleteOne()` or `deleteMany()`

### 1.5 **`id` Getter Returns `null` for Nullish `_id`**
- Instead of `undefined`, documents with nullish `_id` will have `id` return `null`

### 1.6 **Discriminator Schemas Get `_id` by Default**
- If you use discriminators, they now include `_id` by default

### 1.7 **Removed `castForQueryWrapper`**
- Custom SchemaTypes need updates if using this

## 2. Files to Review and Modify

Let me search your codebase for specific patterns that need updating: 

Searched for regex `Types\.ObjectId\(`, no results

Searched for regex `\.remove\(`, no results

Searched for regex `callback|\.exec\(.*function`, 3 results

Searched for regex `mongoose\.connect|createConnection`, 2 results

Searched for regex `Schema\(|new Schema`, 20 results

Searched for regex `strictQuery`, no results

Searched for regex `useNewUrlParser|useUnifiedTopology|useFindAndModify|useCreateIndex`, no results

Searched for regex `\.model\(|mongoose\.model`, 20 results

Read [](file:///Users/lavid/Documents/workplace/wcp-order-backend/src/App.ts#1-1), lines 1 to 100

Searched for regex `findOne|findById|find\(|updateOne|updateMany|deleteOne|deleteMany|findByIdAndUpdate|findOneAndUpdate`, 20 results

Read [](file:///Users/lavid/Documents/workplace/wcp-order-backend/src/config/dataprovider.ts#85-85), lines 85 to 100

Read [](file:///Users/lavid/Documents/workplace/wcp-order-backend/src/config/dataprovider.ts#200-200), lines 200 to 226

Searched for regex `Schema\.Types\.Mixed|SchemaTypes\.Mixed`, 14 results

Searched for regex `\.save\(`, 17 results

Now let me check for any usage of deprecated `isValidObjectId`: 

Searched for regex `isValidObjectId|isValid`, 7 results

Searched for regex `discriminator`, 20 results

Read [](file:///Users/lavid/Documents/workplace/wcp-order-backend/src/models/query/WConstLiteral.ts)

Now let me check for populate and lean usage patterns: 

Searched for regex `\.populate\(|\.lean\(`, no results

Searched for regex `HydratedDocument|Document`, 17 results

Based on my thorough analysis of your codebase, here's a comprehensive migration plan:

---

# Detailed Migration Plan: Mongoose 6.x → 7.x

## Phase 1: Pre-Migration Preparation

### 1.1 Update Dependencies
```json
// package.json change
"mongoose": "^7.8.0"  // Latest 7.x stable
```

### 1.2 Review Node.js Version
- Mongoose 7 requires **Node.js 14.20.1 or higher**
- Your current setup should be compatible

---

## Phase 2: Critical Breaking Changes to Address

### 2.1 **Remove Callback-Based Patterns** ⚠️ HIGH PRIORITY

**Files affected:**
- dataprovider.ts (lines 92, 213)

**Current problematic code:**
```typescript
// Line 92 - Settings setter
SettingsModel.findOne(function (_err: Error, db_settings: HydratedDocument<IWSettings>) {
  Object.assign(db_settings, da);
  db_settings.save()...
});

// Line 213 - KeyValueConfig setter
KeyValueModel.findOne(function (_err: Error, db_key_values: HydratedDocument<IKeyValueStore>) {
  ...
  db_key_values.save()...
});
```

**Required changes:**
Convert to async/await pattern. You'll need to refactor these setters to be async methods or use a different pattern since setters can't be async directly.

### 2.2 **`strictQuery` Default Change**
- In Mongoose 7, `strictQuery` defaults to `true` instead of `false`
- **Action**: Add explicit configuration in App.ts:
```typescript
mongoose.set('strictQuery', false); // Add before mongoose.connect()
```
Or review all queries to ensure they only filter by schema-defined fields.

---

## Phase 3: Connection Options Changes

### 3.1 **Update Connection Code** (App.ts, line 78)

**Current:**
```typescript
mongoose.connect(url, { user: DBUSER, pass: DBPASS });
```

**Changes needed:**
- `useNewUrlParser`, `useUnifiedTopology`, `useFindAndModify`, `useCreateIndex` options are **removed** in Mongoose 7 (they were already no-ops in v6)
- Your current code is clean and should work as-is

---

## Phase 4: Schema and Model Changes

### 4.1 **Discriminator Schemas** (WConstLiteral.ts)

Your discriminator schemas explicitly set `_id: false`, which is good. In Mongoose 7, discriminator schemas get `_id: true` by default if not specified.

**Your current code is already compatible** because you explicitly set `_id: false`:
```typescript
}, { _id: false, discriminatorKey: 'discriminator', ... });
```

### 4.2 **Schema.Types.Mixed Usage**
Files using `Schema.Types.Mixed`:
- WConstLiteral.ts
- WAbstractExpression.ts
- WAbstractOrderExpression.ts
- WOrderInstance.ts
- WOrderLineDiscount.ts
- WOrderPayment.ts
- FulfillmentSchema.ts
- database_manager.ts

**No changes required** - `Schema.Types.Mixed` continues to work the same way.

---

## Phase 5: Query Method Changes

### 5.1 **Query Returns are Now Thenables**
All your current usage patterns (`.find().exec()`, `findOne()`, `findByIdAndUpdate()`, etc.) are compatible.

### 5.2 **Files to Review for Query Patterns**
- dataprovider.ts - Multiple `findOne`, `findByIdAndUpdate`, `findByIdAndDelete` calls
- database_manager.ts - Multiple `find`, `findOneAndUpdate`, `updateMany` calls
- catalog_provider.ts - Various CRUD operations

---

## Phase 6: TypeScript Type Changes

### 6.1 **`HydratedDocument` Import**
Your imports in dataprovider.ts line 3:
```typescript
import { HydratedDocument } from 'mongoose';
```
This remains valid in Mongoose 7.

### 6.2 **Generic Type Parameters**
Your schema definitions like:
```typescript
new Schema<IMoney>({...})
mongoose.model<IProduct>(...)
```
These patterns remain valid.

---

## Phase 7: Step-by-Step Migration Checklist

### Step 1: Update package.json
```bash
pnpm update mongoose@7
```

### Step 2: Add `strictQuery` configuration in App.ts
Add before the `mongoose.connect()` call:
```typescript
mongoose.set('strictQuery', false);
```

### Step 3: Refactor callback patterns in dataprovider.ts

**Refactor `set Settings`** (around line 91-97):
```typescript
// Create a new async method instead of setter
async updateSettings(da: IWSettings) {
  this.#settings = da;
  const db_settings = await SettingsModel.findOne();
  if (db_settings) {
    Object.assign(db_settings, da);
    await db_settings.save();
    logger.debug("Saved settings %o", db_settings);
  }
}
```

**Refactor `set KeyValueConfig`** (around line 211-223):
```typescript
// Create a new async method instead of setter
async updateKeyValueConfig(da: Record<string, unknown>) {
  this.#keyvalueconfig = da;
  const db_key_values = await KeyValueModel.findOne();
  if (db_key_values) {
    const settings_list = [];
    for (var i in da) {
      settings_list.push({ key: i, value: da[i] });
    }
    db_key_values.settings = settings_list;
    await db_key_values.save();
    logger.debug("Saved key/value config %o", db_key_values);
  }
}
```

### Step 4: Update all callers of the refactored setters
Search for usages of:
- `DataProviderInstance.Settings = ...`
- `DataProviderInstance.KeyValueConfig = ...`

And convert them to:
- `await DataProviderInstance.updateSettings(...)`
- `await DataProviderInstance.updateKeyValueConfig(...)`

### Step 5: Test Database Migrations
Your database_manager.ts has many migration scripts. Run these in a test environment first.

### Step 6: Run Full Test Suite
```bash
pnpm test
```

---

## Phase 8: Post-Migration Verification

### 8.1 Items to Verify
- [ ] All database connections work
- [ ] All CRUD operations function correctly
- [ ] All discriminators resolve properly
- [ ] Socket.io events with database operations work
- [ ] Database migrations run successfully

### 8.2 Performance Considerations
- Mongoose 7 has improved performance for many operations
- Monitor memory usage after migration

---

## Summary of Required Code Changes

| File | Change Required | Priority |
|------|-----------------|----------|
| package.json | Update mongoose version | Critical |
| App.ts | Add `strictQuery` setting | High |
| dataprovider.ts | Convert callback setters to async methods | Critical |
| Callers of dataprovider setters | Update to use async methods | Critical |

**Estimated effort**: 2-4 hours for code changes, plus testing time.