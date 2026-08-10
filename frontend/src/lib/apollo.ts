import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient as createWsClient } from "graphql-ws";
import nhost from "./nhost";

function getAuthHeaders() {
  const session = nhost.getUserSession();
  const token = session?.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const GRAPHQL_HTTP_URL =
  process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL ||
  "https://local.graphql.local.nhost.run/v1";

const GRAPHQL_WS_URL =
  process.env.NEXT_PUBLIC_NHOST_GRAPHQL_WS_URL ||
  "wss://local.graphql.local.nhost.run/v1";

// setContext re-reads the auth header on EVERY request, not just once at
// startup — required since the access token expires every 15 minutes
// (auth.session.accessToken.expiresIn in nhost.toml) and gets silently
// refreshed in storage by the SDK's session middleware in the background.
const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    ...getAuthHeaders(),
  },
}));

const httpLink = new HttpLink({ uri: GRAPHQL_HTTP_URL });

const wsLink =
  typeof window !== "undefined"
    ? new GraphQLWsLink(
      createWsClient({
        url: GRAPHQL_WS_URL,
        connectionParams: () => ({
          headers: getAuthHeaders(),
        }),
      })
    )
    : null;

const splitLink =
  typeof window !== "undefined" && wsLink
    ? split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === "OperationDefinition" &&
          definition.operation === "subscription"
        );
      },
      wsLink,
      authLink.concat(httpLink)
    )
    : authLink.concat(httpLink);

const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});

export default apolloClient;