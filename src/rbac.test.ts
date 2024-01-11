import { RBAC, Roles } from './rbac'

type TestRole = 'reader' | 'editor' | 'publisher'
interface TestParams {
  userId: string
  userHasSubscription?: boolean
  userDepartments: string[]
  userMagazines: string[]
  articleDepartmentId?: string
  articleId?: string
  articleIsPremium?: boolean
  articleOwnerId?: string
  articleMagazine: string
  requireGlobalFilter: boolean
}

const roles: Roles<TestParams, TestRole> = {
  reader: {
    can: [
      'article:rate',
      'article:share',
      {
        name: 'article:read',
        when: async ({ articleIsPremium, userHasSubscription }) => {
          if (articleIsPremium === undefined || userHasSubscription === undefined) throw new Error('Required params missing!')
          return !articleIsPremium || (articleIsPremium && userHasSubscription)
        },
      },
      {
        name: 'article:list',
        filter: async ({ userHasSubscription }) => {
          if (userHasSubscription === undefined) throw new Error('Required params missing!')
          if (!userHasSubscription) return { premium: { $in: [null, false] } }
          return undefined
        },
      },
    ],
  },
  editor: {
    can: [
      'article:read',
      'article:list',
      'article:create',
      {
        name: 'article:rate',
        when: async ({ articleOwnerId, userId }) => {
          if (userId === undefined || articleOwnerId === undefined) throw new Error('Required params missing!')
          return userId !== articleOwnerId
        },
      },
      {
        name: 'article:update',
        when: async ({ articleDepartmentId, userDepartments }) => {
          if (!articleDepartmentId) throw new Error('Required params missing!')
          return (userDepartments || []).includes(articleDepartmentId)
        },
      },
    ],
    inherits: ['reader'],
  },
  publisher: {
    can: ['article:*'],
    inherits: ['editor'],
  },
}

const rolesPromise = new Promise<typeof roles>((resolve) => {
  setTimeout(() => {
    resolve(roles)
  }, 500)
})

const rolesFactory = async () => {
  const rolesPromise = new Promise<typeof roles>((resolve) => {
    setTimeout(() => {
      resolve(roles)
    }, 500)
  })

  return rolesPromise
}

describe('RBAC should initialize', () => {
  test('with construtor.', () => {
    expect(new RBAC(roles)).toBeInstanceOf(RBAC)
  })

  test('with async create function.', async () => {
    expect(await RBAC.create(roles)).toBeInstanceOf(RBAC)
  })

  test('with async create function and roles promise.', async () => {
    expect(await RBAC.create(rolesPromise)).toBeInstanceOf(RBAC)
  })

  test('with async create function and roles factory function.', async () => {
    expect(await RBAC.create(rolesFactory)).toBeInstanceOf(RBAC)
  })
})

describe('role reader can', () => {
  const rbac = new RBAC(roles)

  test('not check permission without parameters.', async () => {
    await expect(rbac.can('reader', 'article:read')).rejects.toThrow('Required params missing!')
  })

  test('read none-premium articles without subscription', async () => {
    await expect(rbac.can('reader', 'article:read', { articleIsPremium: false, userHasSubscription: false })).resolves.toEqual({ permission: true })
  })

  test('not read premium articles without subscription', async () => {
    await expect(rbac.can('reader', 'article:read', { articleIsPremium: true, userHasSubscription: false })).resolves.toEqual({ permission: false })
  })

  test('read premium articles with subscription', async () => {
    await expect(rbac.can('reader', 'article:read', { articleIsPremium: true, userHasSubscription: true })).resolves.toEqual({ permission: true })
  })

  test('list only none-premium articles without subscription', async () => {
    await expect(rbac.can('reader', 'article:list', { userHasSubscription: false })).resolves.toEqual({
      permission: true,
      filter: { premium: { $in: [null, false] } },
    })
  })

  test('not generate filter when params missing', async () => {
    await expect(rbac.can('reader', 'article:list')).rejects.toThrow('Required params missing!')
  })

  test('list all articles with subscription', async () => {
    await expect(rbac.can('reader', 'article:list', { userHasSubscription: true })).resolves.toEqual({ permission: true })
  })
})

describe('role editor can', () => {
  const rbac = new RBAC(roles)

  test('read all article without conditions.', async () => {
    await expect(rbac.can('editor', 'article:read')).resolves.toEqual({ permission: true })
  })

  test('list all article without filters.', async () => {
    await expect(rbac.can('editor', 'article:list')).resolves.toEqual({ permission: true })
  })

  test('inherit article:share from reader.', async () => {
    await expect(rbac.can('editor', 'article:share')).resolves.toEqual({ permission: true })
  })

  test('not check inherited permission without params.', async () => {
    await expect(rbac.can('editor', 'article:rate')).rejects.toThrow('Required params missing!')
  })

  test('not rate own articles.', async () => {
    await expect(rbac.can('editor', 'article:rate', { userId: '001', articleOwnerId: '001' })).resolves.toEqual({ permission: false })
  })

  test('rate articles with different owner.', async () => {
    await expect(rbac.can('editor', 'article:rate', { userId: '001', articleOwnerId: '002' })).resolves.toEqual({ permission: true })
  })

  test('not check article:update permission without required params.', async () => {
    await expect(rbac.can('editor', 'article:update')).rejects.toThrow('Required params missing!')
  })

  test('not update articles of foreign departments.', async () => {
    await expect(rbac.can('editor', 'article:update', { articleDepartmentId: 'economics', userDepartments: ['culture', 'politics'] })).resolves.toEqual({
      permission: false,
    })
  })

  test('update articles of own departments.', async () => {
    await expect(rbac.can('editor', 'article:update', { articleDepartmentId: 'economics', userDepartments: ['economics', 'politics'] })).resolves.toEqual({
      permission: true,
    })
  })
})

describe('role publisher can', () => {
  const rbac = new RBAC(roles)

  test('read articles.', async () => {
    await expect(rbac.can('publisher', 'article:read')).resolves.toEqual({ permission: true })
  })

  test('list articles.', async () => {
    await expect(rbac.can('publisher', 'article:list')).resolves.toEqual({ permission: true })
  })

  test('rate articles.', async () => {
    await expect(rbac.can('publisher', 'article:rate')).resolves.toEqual({ permission: true })
  })

  test('share articles.', async () => {
    await expect(rbac.can('publisher', 'article:share')).resolves.toEqual({ permission: true })
  })

  test('update articles.', async () => {
    await expect(rbac.can('publisher', 'article:share')).resolves.toEqual({ permission: true })
  })

  test('delete articles.', async () => {
    await expect(rbac.can('publisher', 'article:publish')).resolves.toEqual({ permission: true })
  })

  test('delete articles.', async () => {
    await expect(rbac.can('publisher', 'article:delete')).resolves.toEqual({ permission: true })
  })

  test('not create new magazine.', async () => {
    await expect(rbac.can('publisher', 'magazine:create')).resolves.toEqual({ permission: false })
  })
})

describe('with global when conditions and global filters rbac should', () => {
  const rbac = new RBAC(roles, {
    globalWhen: async ({ articleMagazine, userMagazines }) => {
      if (!articleMagazine) throw new Error('Required params missing!')
      return (userMagazines || []).includes(articleMagazine)
    },
    globalFilter: async ({ articleMagazine, userMagazines, requireGlobalFilter }) => {
      if (requireGlobalFilter) {
        if (!articleMagazine) throw new Error('Required params missing!')
        return { magazine: { $in: userMagazines || [] } }
      }
      return undefined
    },
    mergeFilters: (filters) => filters.reduce((prev, current) => ({ ...prev, ...current }), {}),
  })

  test('not check permissions without required params.', async () => {
    await expect(rbac.can('publisher', 'article:publish')).rejects.toThrow('Required params missing!')
  })

  test('not allow to publish articles in other magazines.', async () => {
    await expect(rbac.can('publisher', 'article:publish', { articleMagazine: 'bravo', userMagazines: ['nzz folio', 'new yorker'] })).resolves.toEqual({
      permission: false,
    })
  })

  test('allow to publish articles in own magazines.', async () => {
    await expect(rbac.can('publisher', 'article:publish', { articleMagazine: 'new yorker', userMagazines: ['nzz folio', 'new yorker'] })).resolves.toEqual({
      permission: true,
    })
  })

  test('not generate filter without required operation params.', async () => {
    await expect(
      rbac.can('reader', 'article:list', { articleMagazine: 'new yorker', userMagazines: ['nzz folio', 'new yorker'], requireGlobalFilter: true })
    ).rejects.toThrow('Required params missing!')
  })

  test('not generate filter without required global params.', async () => {
    await expect(rbac.can('reader', 'article:list', { userHasSubscription: true, requireGlobalFilter: true })).rejects.toThrow('Required params missing!')
  })

  test('generate merged filters (operation and global) for operations that requere global filters.', async () => {
    await expect(
      rbac.can('reader', 'article:list', {
        userHasSubscription: false,
        articleMagazine: 'new yorker',
        userMagazines: ['nzz folio', 'new yorker'],
        requireGlobalFilter: true,
      })
    ).resolves.toEqual({
      permission: true,
      filter: {
        magazine: { $in: ['nzz folio', 'new yorker'] },
        premium: { $in: [null, false] },
      },
    })
  })

  test('throw an error if global and operation filter apply but mergeFilters() is undefined.', async () => {
    const rbac = new RBAC(roles, {
      globalWhen: async ({ articleMagazine, userMagazines }) => {
        if (!articleMagazine) throw new Error('Required params missing!')
        return (userMagazines || []).includes(articleMagazine)
      },
      globalFilter: async ({ articleMagazine, userMagazines, requireGlobalFilter }) => {
        if (requireGlobalFilter) {
          if (!articleMagazine) throw new Error('Required params missing!')
          return { magazine: { $in: userMagazines || [] } }
        }
        return undefined
      },
    })

    await expect(
      rbac.can('reader', 'article:list', {
        userHasSubscription: false,
        articleMagazine: 'new yorker',
        userMagazines: ['nzz folio', 'new yorker'],
        requireGlobalFilter: true,
      })
    ).rejects.toThrow('A global and operation filter apply. Define mergeFilters() function in RBAC options.')
  })
})

describe('with multiple roles rbac should', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: Roles<Record<string, any>, 'viewer' | 'commenter' | 'editor'> = {
    viewer: {
      can: [
        'view',
        {
          name: 'list',
          filter: async () => {
            return { documents: { $in: ['viewable'] } }
          },
        },
        {
          name: 'readpart',
          project: async () => ({ name: true }),
        },
      ],
    },
    commenter: {
      can: [
        'comment',
        {
          name: 'list',
          filter: async () => {
            return { documents: { $in: ['viewable', 'commentable'] } }
          },
        },
        {
          name: 'readpart',
          project: async () => ({ name: true, description: true }),
        },
      ],
    },
    editor: {
      can: ['edit', 'list'],
    },
  }

  const rbac = new RBAC(roles, {
    mergeFilters: (filters) => ({
      $or: filters,
    }),
  })

  test('allow operation if one role has permission', async () => {
    await expect(rbac.can(['viewer', 'commenter', 'editor'], 'edit')).resolves.toEqual({ permission: true })
  })

  test('not allow operation if none of the roles has permission', async () => {
    await expect(rbac.can(['viewer', 'commenter'], 'edit')).resolves.toEqual({ permission: false })
  })

  test('use no filter if one role has filterless permission', async () => {
    await expect(rbac.can(['viewer', 'commenter', 'editor'], 'list')).resolves.toEqual({ permission: true })
  })

  test('use filter if only one role has filter generator', async () => {
    await expect(rbac.can(['commenter'], 'list')).resolves.toEqual({ permission: true, filter: { documents: { $in: ['viewable', 'commentable'] } } })
  })

  test('merge filter if multiple roles have filter generators and mergeFilter exists', async () => {
    await expect(rbac.can(['viewer', 'commenter'], 'list')).resolves.toEqual({
      permission: true,
      filter: { $or: [{ documents: { $in: ['viewable'] } }, { documents: { $in: ['viewable', 'commentable'] } }] },
      project: undefined,
    })
  })

  test('throw error multiple roles have project generators and mergeProjection is missing', async () => {
    await expect(rbac.can(['viewer', 'commenter'], 'readpart')).rejects.toThrow(
      'Multiple roles with multiple project apply. Define mergeProject() function in RBAC options.'
    )
  })
})
