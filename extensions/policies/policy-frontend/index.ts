import { policy } from "../policy.ts";

export default policy(import.meta.dirname, { files: /\.(html|erb|slim)$/ });
