import { policy } from "../policy.ts";

export default policy(import.meta.dirname, { paths: ["config/application.rb"] });
