#!/usr/bin/env python3
"""
Script para aplicar migration no Supabase via conexao PostgreSQL direta.

Uso:
    python scripts/apply_migration.py

Requisitos:
    - SUPABASE_DB_PASSWORD definido no .env
    - Ou passar como argumento: python scripts/apply_migration.py <PASSWORD>
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql

# Adicionar apps/api ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))

def get_connection_string(password=None):
    """Monta connection string do Supabase."""
    load_dotenv()

    SUPABASE_URL = os.getenv('SUPABASE_URL')
    project_ref = SUPABASE_URL.replace('https://', '').split('.')[0]

    if not password:
        password = os.getenv('SUPABASE_DB_PASSWORD')

    if not password:
        raise ValueError(
            "Senha do banco nao encontrada. Defina SUPABASE_DB_PASSWORD no .env "
            "ou passe como argumento."
        )

    return f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres"

def apply_migration(sql_file):
    """Aplica migration SQL no Supabase."""
    with open(sql_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()

    conn = None
    try:
        # Obter senha
        if len(sys.argv) > 1:
            password = sys.argv[1]
        else:
            password = os.getenv('SUPABASE_DB_PASSWORD')

        conn_string = get_connection_string(password)
        print(f"Conectando ao Supabase...")

        conn = psycopg2.connect(conn_string)
        conn.autocommit = True
        cursor = conn.cursor()

        print(f"Executando migration: {sql_file}")

        # Executar SQL
        cursor.execute(migration_sql)

        print("Migration aplicada com sucesso!")

        # Verificar tabelas criadas
        cursor.execute("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename IN ('relationship_plans', 'plan_prompts', 'plan_prompt_versions')
            ORDER BY tablename;
        """)

        tables = cursor.fetchall()
        print(f"\nTabelas verificadas:")
        for table in tables:
            print(f"  - {table[0]}")

        cursor.close()

    except Exception as e:
        print(f"Erro ao aplicar migration: {e}")
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migration_file = os.path.join(
        os.path.dirname(__file__),
        "..",
        "supabase",
        "migrations",
        "20260113_relationship_plans.sql"
    )

    apply_migration(migration_file)
