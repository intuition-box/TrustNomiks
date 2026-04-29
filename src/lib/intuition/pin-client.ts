/**
 * Thin client for Intuition's IPFS pin mutations.
 *
 * Uses the Intuition GraphQL endpoint (`pinThing` / `pinPerson` /
 * `pinOrganization`). No authentication required — these mutations are
 * pre-chain and free.
 *
 * All schema types share the same response shape: `{ uri: "ipfs://..." }`.
 *
 * Hasura request transformation requires every field declared by the schema
 * to be present in the variables (use `""` for empty), so each helper enforces
 * the full field set.
 */

import { INTUITION_GRAPHQL_ENDPOINT } from './config'

export interface PinResponse {
  uri: string
}

interface ThingInput {
  name: string
  description?: string
  image?: string
  url?: string
}

interface PersonInput {
  name: string
  description?: string
  image?: string
  url?: string
  email?: string
  identifier?: string
}

interface OrganizationInput {
  name: string
  description?: string
  image?: string
  url?: string
  email?: string
}

const PIN_THING = /* GraphQL */ `
  mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
    pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) { uri }
  }
`

const PIN_PERSON = /* GraphQL */ `
  mutation pinPerson($name: String!, $description: String!, $image: String!, $url: String!, $email: String!, $identifier: String!) {
    pinPerson(person: { name: $name, description: $description, image: $image, url: $url, email: $email, identifier: $identifier }) { uri }
  }
`

const PIN_ORGANIZATION = /* GraphQL */ `
  mutation pinOrganization($name: String!, $description: String!, $image: String!, $url: String!, $email: String!) {
    pinOrganization(organization: { name: $name, description: $description, image: $image, url: $url, email: $email }) { uri }
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

async function postGraphQL<T>(query: string, variables: Record<string, string>): Promise<T> {
  const res = await fetch(INTUITION_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    throw new Error(`[pin-client] HTTP ${res.status} from ${INTUITION_GRAPHQL_ENDPOINT}`)
  }
  const json = (await res.json()) as GraphQLResponse<T>
  if (json.errors?.length) {
    throw new Error(`[pin-client] GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`)
  }
  if (!json.data) {
    throw new Error('[pin-client] empty response data')
  }
  return json.data
}

function assertIpfsUri(uri: unknown, schemaType: string): string {
  if (typeof uri !== 'string' || !uri.startsWith('ipfs://')) {
    throw new Error(`[pin-client] ${schemaType} returned invalid uri: ${JSON.stringify(uri)}`)
  }
  return uri
}

/**
 * Pin a schema.org Thing via Intuition's GraphQL endpoint.
 * Returns the IPFS URI to be hashed into a termId.
 */
export async function pinThing(input: ThingInput): Promise<string> {
  const data = await postGraphQL<{ pinThing: PinResponse }>(PIN_THING, {
    name: input.name,
    description: input.description ?? '',
    image: input.image ?? '',
    url: input.url ?? '',
  })
  return assertIpfsUri(data.pinThing?.uri, 'pinThing')
}

/** Pin a schema.org Person. Reserved for future entities (founders, contributors). */
export async function pinPerson(input: PersonInput): Promise<string> {
  const data = await postGraphQL<{ pinPerson: PinResponse }>(PIN_PERSON, {
    name: input.name,
    description: input.description ?? '',
    image: input.image ?? '',
    url: input.url ?? '',
    email: input.email ?? '',
    identifier: input.identifier ?? '',
  })
  return assertIpfsUri(data.pinPerson?.uri, 'pinPerson')
}

/** Pin a schema.org Organization. Reserved for future entities (DAOs, protocol teams). */
export async function pinOrganization(input: OrganizationInput): Promise<string> {
  const data = await postGraphQL<{ pinOrganization: PinResponse }>(PIN_ORGANIZATION, {
    name: input.name,
    description: input.description ?? '',
    image: input.image ?? '',
    url: input.url ?? '',
    email: input.email ?? '',
  })
  return assertIpfsUri(data.pinOrganization?.uri, 'pinOrganization')
}

/** Discriminated payload for builders that pick a schema type per entity. */
export type PinPayload =
  | { schema: 'Thing'; data: ThingInput }
  | { schema: 'Person'; data: PersonInput }
  | { schema: 'Organization'; data: OrganizationInput }

export async function pinByPayload(payload: PinPayload): Promise<string> {
  switch (payload.schema) {
    case 'Thing':        return pinThing(payload.data)
    case 'Person':       return pinPerson(payload.data)
    case 'Organization': return pinOrganization(payload.data)
  }
}
