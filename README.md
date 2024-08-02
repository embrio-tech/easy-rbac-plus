# `@embrio-tech/easy-rbac-plus`

> ### :no_entry: DEPRECATED – Use [`@policer-io/pdp-ts`](https://www.npmjs.com/package/@policer-io/pdp-ts) instead

Extended HRBAC (Hierarchical Role Based Access Control) implementation for Node.js inspired by and based on [easy-rbac](https://github.com/DeadAlready/easy-rbac) by [DeadAlready](https://github.com/DeadAlready)

[![embrio.tech](https://img.shields.io/static/v1?label=by&message=EMBRIO.tech&color=24ae5f)](https://embrio.tech)
[![Pipeline](https://github.com/embrio-tech/easy-rbac-plus/actions/workflows/test.yml/badge.svg)](https://github.com/embrio-tech/easy-rbac-plus/actions/workflows/test.yml)

## :gem: Why `easy-rbac-plus`?

When doing access control for requests on multiple documents–—for example GET `/articles`——you want to set query filters automatically based on a user's role. [easy-rbac-plus](https://github.com/embrio-tech/easy-rbac-plus) implements this while maintaining the functionality of [easy-rbac](https://github.com/DeadAlready/easy-rbac).

### Additional Features

`easy-rbac-plus` has the following additional features compared to [easy-rbac](https://github.com/DeadAlready/easy-rbac)

- Generate db query filter objects based on a users permissions
- Global `when`-conditions and `filter`-generators which apply for all operations.
- The module is fully typed (Typescript Support).

## :floppy_disk: Installation

### Prerequisites

- Node >= v16.x is required

### Install

use yarn command

    yarn add @embrio-tech/easy-rbac-plus

or npm command

    npm install --save @embrio-tech/easy-rbac-plus

## :orange_book: Usage

### Basic Usage

The `@embrio-tech/easy-rbac-plus` module can be used to check if a user with a role has a certain permission and to generate db query filters according to the role.

```typescript
// import module and types
import { RBAC, Roles } from '@embrio-tech/easy-rbac-plus'

// define your role and params types
type AppRole = 'reader' | 'editor'
interface AppParams {
  ownerId?: string
  userId: string
}

// define your roles and permissions
const roles: Roles<AppParams, AppRole> = {
  reader: {
    can: [
      // role permissions
    ],
  },
  editor: {
    can: [
      // role permissions
    ],
    inherits: [
      // inherited roles
      'reader',
    ],
  },
}

// create rbac instance with constructor
const rbac = new RBAC(roles)

// use rbac.can() to async check permissions and get filter
async function doSomething() {
  const { permission, filter } = await rbac.can('reader', 'article:read', { ownerId: 'b003', userId: 'u245' })
  if (permission) {
    // we are allowed
    const articles = await articleService.getMultiple({ filter })
  } else {
    // we are not allowed
  }
}

// always make sure
doSomething().catch((error) => {
  // to handle errors
})
```

### Permissions Configuration

There are two basic ways of configure permissions a role has.

1. As `string` with the allowed operation name. For example `'account'`, `'article:create'`, or `'user:*'` to grant permissions **without conditions**
2. As `object` to grant permissions **conditionally**
   - the operation `name`
   - a optional async `when`-function returning a `boolean` to check permission based on context `params`. For example `userId` or document `ownerId`.
   - a optional async `filter`-function which computes and returns a filter `object` based on context `params`.
   - a optional async `project`-function which computes and returns a project `object` based on context `params`.

```typescript
const roles: Roles = {
  // role name reader
  reader: {
    can: [
      {
        name: 'articles:read',
        // reader can read only a list of articles he paid for
        filter: async (params) => {
          const { userId } = params
          paidArticles = await subscriptionService.getPaidArticles(userId)
          return { _id: { $in: allowedArticles } }
        },
        project: async (params) => {
          const { userId } = params
          // remove non-public fields for unknown users for example
          return !userId ? { field1: false } : undefined
        },
      },
    ],
  },
  // role name editor
  editor: {
    // list of allowed operations
    can: [
      'account',
      'post:create',
      {
        name: 'article:update',
        // editor can update an article when he is the owner
        when: async (params) => params.userId === params.ownerId,
      },
      'user:create',
      { name: 'article:delete' },
      //  ... more allowed operations
    ],
    inherits: ['reader'],
  },
  // ... more roles
}
```

#### Async Initialization

In case you want to generate your `roles` config object asynchronously, you can use the static async create function. This is useful when you need to fetch your roles definitions or query them from a db. There are two options for async initialization.

1. with a roles promise `Promise<Roles>`
2. with an async factory function `() => Promise<Roles>`

Example with roles promise `Promise<Roles>`:

```typescript
// with roles promise
async function initialize() {
  const rolesPromise = new Promise((resolve) => {
    resolve(roles)
  })
  const rbac = await RBAC.create(rolesPromise)
  return rbac
}

initialize()
  .then((rbac) => {
    // use the rbac instance
  })
  .catch((error) => {
    // catch errors
  })
```

Example with async factory function `() => Promise<Roles>`:

```typescript
// with async factory function
async function initialize() {
  const rolesFactory = async () => {
    const roles = {
      // ... your roles
    }
    return roles
  }
  const rbac = await RBAC.create(rolesFactory)
  return rbac
}

initialize()
  .then((rbac) => {
    // use the rbac instance
  })
  .catch((error) => {
    // catch errors
  })
```

The static async create function also works with a sync roles config object.

```typescript
// with sync roles object
async function initialize() {
  const roles = {
    // ... your roles
  }
  const rbac = await RBAC.create(roles)
  return rbac
}

initialize()
  .then((rbac) => {
    // use the rbac instance
  })
  .catch((error) => {
    // catch errors
  })
```

#### Wildcards

Each name of operation can include `*` character as a wildcard match. It will match anything in its stead. So something like `account:*` will match everything starting with `account:`.

Specific operations are always prioritized over wildcard operations. This means that if you have a definition like:

```typescript
const roles: Roles = {
  user: {
    can: [
      'user:create',
      {
        name: 'user:*',
        when: async (params) => params.id === params.userId,
      },
    ],
  },
}
```

Then `user:create` will not run the provided when operation, whereas everything else starting with `user:` does.

#### Set Global Conditions

Globally valid `when` and `filter` conditions can be set. This is very useful for example for multi-tenancy projects where you want to make sure a user can only access the documents that belong to his tenant, independent of the operation.

Global `when` and `filter` conditions can be defined at initialization.

```typescript
// a user allocated to a tenant can only read documents of this tenant or document without tenant allocation
const globalWhen = async ({ userTenantId, documentTenantId }) => {
  return userTenantId === documentTenantId || !documentTenantId || !userTenantId
}

// set query filter to query only documents with the user's tenantId or no tenant id
const globalFilter = async ({ userTenantId, documentTenantId }) => {
  if (userTenantId) return { documentTenantId: { $in: [null, userTenantId] } }
  return undefined
}

// set projection to query only documents with the user's tenantId or no tenant id
const globalProject = async ({ userTenantId, documentTenantId }) => {
  if (userTenantId) return { field1: false, field2: false }
  return undefined
}

// set global when and filter functions as options
const rbac = new RBAC(roles, { globalWhen, globalFilter, globalProject })
```

If `when` or `filter` functions are set for a single operation (locally) **and** globally the following applies:

- both `when` conditions must return `true`, the local and the global one in order to grant permission.
- the filter objects are merged together. When both filter objects have equal properties, then the local filter object overwrites the global one.

### Check Permissions

After initialization you can use the `can` function of the object to check if role should have access to an operation.

The function will return a Promise that will resolve if the role can access the operation or reject if something goes wrong
or the user is not allowed to access.

```typescript
async function doSomething() {
  const { permission } = await rbac.can('user', 'article:create')
  if (permission) {
    // we are allowed
  } else {
    // we are not allowed
  }
}

// always make sure
doSomething().catch((error) => {
  // to handle errors
})
```

The `can()` function returns also a `filter` or `project` object if a `filter` or `project` method is defined which apply for the role and operation. The `filter` object can be `undefined` if no `filter` method is defined or if it returns no `filter`.

```typescript
async function doSomething() {
  const { permission, filter } = await rbac.can('user', 'article:create')
  if (permission) {
    // we are allowed
    const documents = await documentService.getMultiple({ filter })
  } else {
    // we are not allowed
  }
}

// always make sure
doSomething().catch((error) => {
  // to handle errors
})
```

The function accepts context parameters as the third parameter, it will be used if there is a `when` or/and `filter` operation in the validation
hierarchy.

```typescript
async function doSomething() {
  const { permission } = await rbac.can('user', 'article:update', { userId: 1, ownerId: 2 })
  if (permission) {
    // we are allowed
  } else {
    // we are not allowed
  }
}

// always make sure
doSomething().catch((error) => {
  // to handle errors
})
```

You can also validate multiple roles at the same time, by providing an array of roles. Permission will be granted if one of the roles has a valid permission. The permission definition with no `filter` defined has priority over the one with filter in case of conflict.

```typescript
async function doSomething() {
  const { permission, filter } = await rbac.can(['reader', 'editor'], 'article:create')
  if (permission) {
    // we are allowed
  } else {
    // we are not allowed
  }
}
```

If the options of the initialization is async then you have to wait for the initialization to resolve before resolving
any checks.

```typescript
async function doSomething() {
  const rbac = await RBAC.create(async () => roles)

  // can() waits for the async initialization of rbac to be completed before resolving
  const { permission, filter } = await rbac.can(['reader', 'editor'], 'article:create')
}
```

## :bug: Bugs

Please report bugs by creating a [bug issue](https://github.com/embrio-tech/easy-rbac-plus/issues/new?assignees=&labels=Bug&template=bug.md&title=).

## :construction_worker_man: Development

### Prerequisites

- [Node Version Manager](https://github.com/nvm-sh/nvm)
  - node: version specified in [`.nvmrc`](/.nvmrc)
- [Yarn](https://classic.yarnpkg.com/en/)

### Install

    yarn install

### Test

    yarn test

or

    yarn test:watch

### Commit

This repository uses commitlint to enforce commit message conventions. You have to specify the type of the commit in your commit message. Use one of the [supported types](https://github.com/pvdlg/conventional-changelog-metahub#commit-types).

    git commit -m "[type]: my perfect commit message"

## :speech_balloon: Contact

[EMBRIO.tech](https://embrio.tech)  
[hello@embrio.tech](mailto:hello@embrio.tech)  
+41 44 552 00 75

## :lock_with_ink_pen: License

The code is licensed under the [MIT License](https://github.com/embrio-tech/easy-rbac-plus/blob/main/LICENSE)
