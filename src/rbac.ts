/* eslint-disable @typescript-eslint/no-explicit-any */

// utility functions
function hasWildcard(string: string): boolean {
  return string.includes('*')
}

function wildcardRegex(string: string): RegExp {
  return new RegExp('^' + string.replace(/\*/g, '.*'))
}

/**
 * modified version easy-rbac by https://github.com/DeadAlready/easy-rbac
 * to achieve role-based filters for db queries
 */
export default class RBAC<Params extends Record<string, any> = Record<string, any>, Role extends string = string> {
  roles: Map<Role, RoleMapItem<Params, Role>>
  private inited: boolean
  private init: Promise<void>
  private options: Options<Params>

  /**
   * new `RBAC` instance
   *
   * @prop {RolesOptions} roles - roles config object containing permissions
   */
  constructor(roles: RolesOptions<Params, Role>, options: Options<Params> = {}) {
    this.inited = false
    this.roles = new Map<Role, RoleMapItem<Params, Role>>()
    this.options = options

    if (typeof roles !== 'function' && typeof (roles as any).then !== 'function') {
      // roles is no function nor promise --> sync init
      this.buildRoleMap(roles as Roles<Params, Role>)
      this.init = Promise.resolve()
    } else {
      // execute roles
      this.init = this.asyncInit(roles)
    }
  }

  /**
   * checks if `role` can do `operation` with given `params`
   *
   * @prop {Role} role - role(s) to check for
   * @prop {string} operation - operation to check
   * @prop {Params} params - needed to execute `when` and `filter` functions
   *
   * @returns object with `{ can: boolean, filter?: Filter }`
   */
  async can(role: Role | Role[], operation: string, params: Params & OperationParams): Promise<{ permission: boolean; filter?: Filter }> {
    // check if initialized
    if (!this.inited) {
      // not inited, wait for init
      await this.init
    }

    if (Array.isArray(role)) {
      // multiple roles provided, test all
      const permissions = await Promise.all(role.map((role) => this.can(role, operation, params)))

      // return permission with no filters if existing
      const filterlessPermission = permissions.find(({ permission, filter }) => permission && !filter)
      if (filterlessPermission) return filterlessPermission

      const filterPermissions = permissions.filter(({ permission, filter }) => permission && filter)
      // if no permission with filter deny
      if (filterPermissions.length < 1) return { permission: false }
      // if one permission with filters return that one
      if (filterPermissions.length === 1) {
        const [filterPermission] = filterPermissions
        return filterPermission
      }
      // if more than one permission with filters
      throw new TypeError('Role definition conflict: Multiple permissions with filters apply.')
    }

    if (typeof role !== 'string') return { permission: false }

    if (typeof operation !== 'string') return { permission: false }

    const roleMapItem = this.roles.get(role)

    if (!roleMapItem) return { permission: false }

    // IF this operation is not defined at current level try higher
    if (!roleMapItem.can[operation] && !roleMapItem.canWildcards.find(({ wildcard }) => wildcard.test(operation))) {
      if (!roleMapItem.inherits || roleMapItem.inherits.length < 1) return { permission: false }

      // check if one of inherited roles resovle true
      return this.can(roleMapItem.inherits, operation, params)
    }

    // try can permissions OR wildcard permissions
    const operationCan = roleMapItem.can[operation] || roleMapItem.canWildcards.find(({ wildcard }) => wildcard.test(operation))
    // if one, await can and filter promises
    if (operationCan) {
      const whenPromise = typeof operationCan.when === 'function' ? operationCan.when(params) : Promise.resolve(true)
      const globalWhenPromise = typeof this.options.globalWhen === 'function' ? this.options.globalWhen(params) : Promise.resolve(true)
      const filterPromise = typeof operationCan.filter === 'function' ? operationCan.filter(params) : Promise.resolve(undefined)
      const globalFilterPromise = typeof this.options.globalFilter === 'function' ? this.options.globalFilter(params) : Promise.resolve(undefined)
      const [permission, globalPermission, filter, globalFilter] = await Promise.all([whenPromise, globalWhenPromise, filterPromise, globalFilterPromise])
      return { permission: permission && globalPermission, filter: globalFilter || filter ? { ...globalFilter, ...filter } : undefined }
    }

    // should never reached here
    throw new Error('something went wrong')
  }

  private buildRoleMap(roles: Roles<Params, Role>) {
    // If not a function then should be object
    if (typeof roles !== 'object') {
      throw new TypeError('Expected input to be object')
    }

    Object.keys(roles).forEach((role) => {
      const roleMapItem: RoleMapItem<Params, Role> = {
        can: {},
        canWildcards: []
      }

      const roleObject = roles[role as Role]

      // check inherits definition and add to roleMapItem
      if (roleObject.inherits) {
        if (!Array.isArray(roleObject.inherits)) {
          throw new TypeError(`Expected roles[${role}].inherits to be an array`)
        }
        roleMapItem.inherits = roleObject.inherits.map((inherit) => {
          if (typeof inherit !== 'string') throw new TypeError(`Expected roles[${role}].inherits element`)
          if (!roles[inherit]) throw new TypeError(`Undefined inheritance role: ${inherit}`)
          return inherit
        })
      }

      // Check can definition
      if (!Array.isArray(roleObject.can)) {
        throw new TypeError(`Expected roles[${role}].can to be an array`)
      }

      // build role map
      roleObject.can.forEach((permission) => {
        // if simple string permission
        if (typeof permission === 'string') {
          if (hasWildcard(permission)) {
            roleMapItem.canWildcards.push({ wildcard: wildcardRegex(permission), name: permission })
          } else {
            roleMapItem.can[permission] = {}
          }
          return
        }

        // if conditional permission with filter
        if (typeof permission === 'object') {
          const { name, filter, when } = permission
          if (!name || typeof name !== 'string') throw new TypeError('name is missing on permission object')
          if (when && typeof when !== 'function') TypeError('when type is not a function')
          if (filter && typeof filter !== 'function') TypeError('filter type is not a function')
          if (hasWildcard(name)) {
            roleMapItem.canWildcards.push({ wildcard: wildcardRegex(name), filter, when, name })
          } else {
            roleMapItem.can[name] = { when, filter }
          }
          return
        }

        // other cases throw error
        throw new TypeError(`Unexpected permission type ${permission}`)
      })

      this.roles.set(role as Role, roleMapItem)
    })

    this.inited = true
  }

  private async asyncInit(roles: any) {
    if (typeof roles === 'function') {
      // roles is a function returning a Promis
      this.buildRoleMap(await (roles as () => Promise<Roles<Params, Role>>)())
    } else if (typeof roles.then === 'function') {
      // roles is a promise
      this.buildRoleMap(await (roles as Promise<Roles<Params, Role>>))
    }
  }
}

// types & interfaces

export interface OperationParams {
  operationName: string
  operationTarget: string
}

export type Filter = Record<string, any>

export interface ConditionEvaluator<Params extends Record<string, any>> {
  (params: Params & OperationParams): Promise<boolean>
}

export interface QueryFilterGenerator<Params extends Record<string, any>> {
  (params: Params & OperationParams): Promise<Filter | undefined>
}

export interface PermissionObject<Params extends Record<string, any>> {
  name: string
  when?: ConditionEvaluator<Params>
  filter?: QueryFilterGenerator<Params>
}

export type Roles<Params extends Record<string, any>, Role extends string> = {
  [key in Role]: {
    can: Array<string | PermissionObject<Params>>
    inherits?: Role[]
  }
}

export type RolesOptions<Params extends Record<string, any>, Role extends string> =
  | Roles<Params, Role>
  | (() => Promise<Roles<Params, Role>>)
  | Promise<Roles<Params, Role>>

interface RoleMapItem<Params extends Record<string, any>, Role extends string> {
  can: { [operation: string]: Omit<PermissionObject<Params>, 'name'> }
  canWildcards: ({ wildcard: RegExp } & PermissionObject<Params>)[]
  inherits?: Role[]
}

interface Options<Params extends Record<string, any>> {
  /** set `globalWhen` which is always executed and must return true to grant permisison */
  globalWhen?: ConditionEvaluator<Params>
  /** set `globalFilter`-generator which is always executed and merged with the filter of a permission */
  globalFilter?: QueryFilterGenerator<Params>
}
