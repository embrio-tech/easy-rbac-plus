# @embrio-tech/easy-rbac-plus

[![embrio.tech](https://img.shields.io/static/v1?label=by&message=EMBRIO.tech&color=24ae5f)](https://embrio.tech)
[![Pipeline](https://github.com/embrio-tech/easy-rbac-plus/actions/workflows/test.yml/badge.svg)](https://github.com/embrio-tech/easy-rbac-plus/actions/workflows/test.yml)

Advanced HRBAC (Hierarchical Role Based Access Control) implementation for Node.js based on [easy-rbac](https://github.com/DeadAlready/easy-rbac) by [DeadAlready](https://github.com/DeadAlready)

## :gem: Why easy-rbac-plus?

When doing access control for requests on multiple documents–for example GET `/books`—you want to set query filters automatically based on a user's role. [easy-rbac-plus](https://github.com/embrio-tech/easy-rbac-plus) implements this while maintaining the functionality of [easy-rbac](https://github.com/DeadAlready/easy-rbac).

## :floppy_disk: Installation

### Prerequisites

- Node >= v14.x is required

### Install

use yarn command

    yarn add @embrio-tech/easy-rbac-plus

or npm command

    npm install --save @embrio-tech/easy-rbac-plus

## :orange_book: Usage

Documentation is Work in progress :construction:

## :bug: Bugs

Please report bugs by creating a [bug issue](https://github.com/embrio-tech/easy-rbac-plus/issues/new?assignees=&labels=Bug&template=bug.md&title=).

## :construction_worker_man: Development

### Prerequisites

- [Node Version Manager](https://github.com/nvm-sh/nvm)
  - node: version specified in [`.nvmrc`](/.nvmrc)
- [Yarn](https://classic.yarnpkg.com/en/)
- Environment variables file
  - Copy the template with

        cp .env.sample .env
- Tenant config file with `TENANT_ID`
  - Copy the template with

        cp public/tenant.json.sample public/tenant.json
    
- [centrifuge-subql](https://github.com/embrio-tech/centrifuge-subql) backend.
  - You can set the url of the backend in [`src/config/tenant/local.ts`](https://github.com/embrio-tech/centrifuge-insights/blob/main/src/config/environment/local.ts) as `graphQLServerUrl`.

### Install

    yarn install

### Test

    yarn test

### Commit

This repository uses commitlint to enforce commit message conventions. You have to specify the type of the commit in your commit message. Use one of the [supported types](https://github.com/pvdlg/conventional-changelog-metahub#commit-types).

    git commit -m "[type]: my perfect commit message"

### 



## :speech_balloon: Contact

[EMBRIO.tech](https://embrio.tech)  
[hello@embrio.tech](mailto:hello@embrio.tech)  
+41 44 552 00 75

## :lock_with_ink_pen: License

The code is licensed under the [MIT License](https://github.com/embrio-tech/easy-rbac-plus/blob/main/LICENSE)