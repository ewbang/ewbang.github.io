import json
import sqlite3

def connect_db():
    conn = sqlite3.connect("test.db")
    return conn

def create_table(conn, table_name, columns):
    columns_def = "id INTEGER PRIMARY KEY AUTOINCREMENT, " + ", ".join([f"{col} TEXT" for col in columns])
    create_table_sql = f"""
        DROP TABLE IF EXISTS {table_name};
        CREATE TABLE {table_name} ({columns_def})
    """
    try:
        cursor = conn.cursor()
        cursor.executescript(create_table_sql)
        print(f"Table {table_name} created successfully.")
    except Exception as e:
        print(f"Error creating table: {e}")

def insert_data(conn, table_name, data):
    if not data:
        print("No data to insert.")
        return

    columns = data[0].keys()
    placeholders = ", ".join(["?" for _ in columns])
    insert_sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
    try:
        cursor = conn.cursor()
        for item in data:
            values = tuple(item[col] for col in columns)
            cursor.execute(insert_sql, values)
        conn.commit()
        print("Data inserted successfully.")
    except Exception as e:
        print(f"Error inserting data: {e}")

def main():
    with open('data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not data:
        print("JSON is empty.")
        return

    conn = connect_db()
    table_name = "ewb_dh_data"
    columns = data[0].keys()

    create_table(conn, table_name, columns)
    insert_data(conn, table_name, data)

    conn.close()

if __name__ == "__main__":
    main()
