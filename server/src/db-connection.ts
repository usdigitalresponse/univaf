import Knex from "knex";
import { loadDbConfig } from "./config";

export default Knex(loadDbConfig());
