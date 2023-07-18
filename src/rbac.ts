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
export class RBAC<Params extends Record<string, any>, Role extends string> {
  private roles: Map<Role, RoleMapItem<Params, Role>>

  private options: Options<Params>

  /**
   * new `RBAC` instance from a roles config object
   *
   * @prop {Roles}      roles - roles config object containing permissions
   * @prop {Options}    options - optional addiontal options
   *
   * @returns new RBAC-instance
   */
  constructor(roles: Roles<Params, Role>, options: Options<Params> = {}) {
    this.roles = new Map<Role, RoleMapItem<Params, Role>>()
    this.options = options
    this.buildRoleMap(roles)
  }

  /**
   * static async creator function supporting async roles config generation
   *
   * @prop {RolesOptions} roles - roles config either as object, promise or factory function
   * @prop {Options}    options - optional addiontal options
   *
   * @returns new RBAC-instance
   */
  static async create<Params extends Record<string, any>, Role extends string>(roles: RolesOptions<Params, Role>, options: Options<Params> = {}) {
    if (typeof roles === 'function') {
      // roles is an async factory function
      return new this(await roles(), options)
    }
    // roles is a static object or a promise
    return new this(await roles, options)
  }

  /**
   * checks if `role` can do `operation` with given `params`
   *
   * @prop {Role} role - role(s) to check for
   * @prop {string} operation - operation to check
   * @prop {Params} params - needed to execute `when` and `filter` functions
   *
   * @returns object with `{ permission: boolean, filter?: Filter }`
   */
  async can(role: Role | Role[], operation: string, params: Partial<Params> = {}): Promise<{ permission: boolean; filter?: Filter; project?: Projection }> {
    if (Array.isArray(role)) {
      // multiple roles provided, test all
      const permissions = await Promise.all(role.map((role) => this.can(role, operation, params)))

      const allowed = permissions.filter(({ permission }) => !!permission)

      if (allowed.length < 1) return { permission: false }

      // return permission with no filters and no project if existing
      const unrestrictedPermission = allowed.find(({ filter, project }) => !filter && !project)
      if (unrestrictedPermission) return unrestrictedPermission

      const filters = allowed.filter(({ filter }) => !!filter).map(({ filter }) => filter)
      const projects = allowed.filter(({ project }) => !!project).map(({ project }) => project)

      const mergeFilters = this.options.mergeFilters
      const mergeProjections = this.options.mergeProjections

      if (filters.length && !mergeFilters) throw new Error('Multiple roles with multiple filter apply. Define mergeFilters() function in RBAC options.')
      if (projects.length && !mergeProjections) throw new Error('Multiple roles with multiple project apply. Define mergeProject() function in RBAC options.')

      const filter = filters.length > 1 ? mergeFilters?.(filters, operation) : filters[0]
      const project = projects.length > 1 ? mergeProjections?.(projects, operation) : projects[0]

      return { permission: true, filter, project }
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
      const projectPromise = typeof operationCan.project === 'function' ? operationCan.project(params) : Promise.resolve(undefined)
      const globalProjectPromise = typeof this.options.globalProject === 'function' ? this.options.globalProject(params) : Promise.resolve(undefined)

      const [permission, globalPermission, filter, globalFilter, project, globalProject] = await Promise.all([
        whenPromise,
        globalWhenPromise,
        filterPromise,
        globalFilterPromise,
        projectPromise,
        globalProjectPromise,
      ])
      return {
        permission: permission && globalPermission,
        filter: globalFilter || filter ? { ...globalFilter, ...filter } : undefined,
        project: globalProject || project ? { ...globalProject, ...project } : undefined,
      }
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
        canWildcards: [],
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
          const { name, filter, when, project } = permission
          if (!name || typeof name !== 'string') throw new TypeError('name is missing on permission object')
          if (when && typeof when !== 'function') throw new TypeError('when type is not a function')
          if (filter && typeof filter !== 'function') throw new TypeError('filter type is not a function')
          if (project && typeof project !== 'function') throw new TypeError('project is not a function')
          if (hasWildcard(name)) {
            roleMapItem.canWildcards.push({ wildcard: wildcardRegex(name), filter, project, when, name })
          } else {
            roleMapItem.can[name] = { when, filter, project }
          }
          return
        }

        // other cases throw error
        throw new TypeError(`Unexpected permission type ${permission}`)
      })

      this.roles.set(role as Role, roleMapItem)
    })
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

/** allows to generate a filter object to select certain documents */
export type Filter = Record<string, any>

/** allows to remove or add fields from db document */
export type Projection = Record<string, boolean>

export interface ConditionEvaluator<Params extends Record<string, any>> {
  (params: Partial<Params>): Promise<boolean>
}

export interface QueryFilterGenerator<Params extends Record<string, any>> {
  (params: Partial<Params>): Promise<Filter | undefined>
}

export interface ProjectionGenerator<Params extends Record<string, any>> {
  (params: Partial<Params>): Promise<Projection | undefined>
}

export interface PermissionObject<Params extends Record<string, any>> {
  name: string
  when?: ConditionEvaluator<Params>
  filter?: QueryFilterGenerator<Params>
  project?: ProjectionGenerator<Params>
}

export type Roles<Params extends Record<string, any> = Record<string, any>, Role extends string = string> = {
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
  /** set `globalProject`-generator which is alway executed and merged with the project of a permisison */
  globalProject?: ProjectionGenerator<Params>
  /** how to merge filters if multiple apply */
  mergeFilters?: (filters: (Filter | undefined)[], operation: string) => Filter | undefined
  /** how to merge filters if multiple apply */
  mergeProjections?: (filters: (Projection | undefined)[], operation: string) => Projection | undefined
}
