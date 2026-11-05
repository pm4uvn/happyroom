import type postgres from "postgres";

export type Db = ReturnType<typeof postgres> | postgres.TransactionSql;
