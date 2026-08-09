import { createClient } from "@nhost/nhost-js";

const nhost = createClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || "local",
  region: process.env.NEXT_PUBLIC_NHOST_REGION || "local",
});

export default nhost;