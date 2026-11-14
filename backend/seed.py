"""Create the schema and load demo data.

    python -m backend.seed            # create tables, seed if empty
    python -m backend.seed --reset    # drop everything and reseed

Uses DATABASE_URL if set (e.g. your Neon connection string), else SQLite.
Run this once against Neon before the first Vercel deploy.
"""

import argparse

from dotenv import load_dotenv

from .db import ROOT, init_db, is_postgres

if __name__ == "__main__":
    load_dotenv(ROOT / ".env")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--reset", action="store_true", help="drop all tables first (deletes data)")
    args = p.parse_args()
    init_db(seed=True, reset=args.reset)
    print(f"Database ready ({'Postgres' if is_postgres() else 'SQLite'}){' — reset and reseeded' if args.reset else ''}.")
