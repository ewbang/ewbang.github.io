from flask import (
    Flask, request, render_template,
    redirect, flash, jsonify
)
import sqlite3
import math
from contextlib import contextmanager
import os
import json


app = Flask(__name__)
app.secret_key = os.urandom(24)

DB_NAME = "test.db"
TABLE_NAME = "ewb_dh_data"
ITEMS_PER_PAGE = 40

# 类型映射字典
TYPE_MAPPING = {
    '1': '系统综合',
    '2': '效率工具',
    '3': '编程开发',
    '4': '人工智能',
    '5': '运维相关',
    '6': '文档教程',
    '7': '杂七杂八',
    '8': '开源项目'
}

# 类型显示顺序
TYPE_DISPLAY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8']


@contextmanager
def get_db_connection():
    """数据库连接上下文管理器"""
    conn = sqlite3.connect(DB_NAME)
    try:
        yield conn
    finally:
        conn.close()


def get_columns():
    """获取所有列名，包括id列"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({TABLE_NAME})")
        return [col[1] for col in cursor.fetchall()]


def get_type_options():
    """获取所有唯一的type值，按照指定顺序返回"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT DISTINCT type FROM {TABLE_NAME} WHERE type IS NOT NULL"
        )
        db_types = [row[0] for row in cursor.fetchall()]
        return sorted(
            db_types,
            key=lambda x: TYPE_DISPLAY_ORDER.index(x) 
            if x in TYPE_DISPLAY_ORDER else float('inf')
        )


def build_where_clause(keyword=None, type_filter=None):
    """构建WHERE子句和参数"""
    where_clauses = []
    args = []
    
    if keyword:
        columns = get_columns()
        where_clauses.append(
            " OR ".join([f"{col} LIKE ?" for col in columns])
        )
        args.extend([f"%{keyword}%"] * len(columns))
    
    if type_filter:
        where_clauses.append("type = ?")
        args.append(type_filter)
    
    where_sql = ""
    if where_clauses:
        where_sql = " WHERE " + " AND ".join(
            f"({clause})" for clause in where_clauses
        )
    
    return where_sql, args


def get_paginated_data(page, keyword=None, type_filter=None):
    """获取分页数据"""
    offset = (page - 1) * ITEMS_PER_PAGE
    with get_db_connection() as conn:
        cursor = conn.cursor()
        base_query = f"SELECT * FROM {TABLE_NAME}"
        where_sql, args = build_where_clause(keyword, type_filter)
        
        query = f"{base_query}{where_sql} ORDER BY id ASC LIMIT ? OFFSET ?"
        args.extend([ITEMS_PER_PAGE, offset])
        
        cursor.execute(query, args)
        return cursor.fetchall()


def get_total_count(keyword=None, type_filter=None):
    """获取总记录数"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        base_query = f"SELECT COUNT(*) FROM {TABLE_NAME}"
        where_sql, args = build_where_clause(keyword, type_filter)
        
        query = f"{base_query}{where_sql}"
        cursor.execute(query, args)
        return cursor.fetchone()[0]


def validate_data(data, columns):
    """验证输入数据"""
    errors = {}
    for col in columns:
        if col != 'id' and (col not in data or not data[col].strip()):
            errors[col] = "此字段不能为空"
    return errors


def insert_row(data):
    """插入新记录"""
    columns = [col for col in get_columns() if col != 'id']
    errors = validate_data(data, columns)
    if errors:
        return False, errors

    with get_db_connection() as conn:
        cursor = conn.cursor()
        placeholders = ', '.join(['?'] * len(columns))
        columns_str = ', '.join(columns)
        sql = (
            f"INSERT INTO {TABLE_NAME} ({columns_str}) "
            f"VALUES ({placeholders})"
        )
        try:
            cursor.execute(
                sql, 
                [data.get(col, '').strip() for col in columns]
            )
            conn.commit()
            return True, None
        except sqlite3.Error as e:
            return False, {"database": str(e)}


def delete_row(pk_value):
    """删除指定id的记录"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE id = ?", 
                (pk_value,)
            )
            if cursor.fetchone()[0] == 0:
                return False, "记录不存在"
            
            cursor.execute(
                f"DELETE FROM {TABLE_NAME} WHERE id = ?", 
                (pk_value,)
            )
            conn.commit()
            return True, None
        except sqlite3.Error as e:
            return False, str(e)


def get_row(pk_value):
    """获取指定id的记录"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?", 
            (pk_value,)
        )
        return cursor.fetchone()


def update_row(pk_value, data):
    """更新指定id的记录"""
    columns = [col for col in get_columns() if col != 'id']
    errors = validate_data(data, columns)
    if errors:
        return False, errors

    with get_db_connection() as conn:
        cursor = conn.cursor()
        assignments = ', '.join([f"{col} = ?" for col in columns])
        values = [data.get(col, '').strip() for col in columns] + [pk_value]
        sql = f"UPDATE {TABLE_NAME} SET {assignments} WHERE id = ?"
        try:
            cursor.execute(sql, values)
            conn.commit()
            return True, None
        except sqlite3.Error as e:
            return False, {"database": str(e)}



@app.route("/")
def index():
    """首页路由"""
    page = int(request.args.get("page", 1))
    search = request.args.get("search", "").strip()
    type_filter = request.args.get("type", "")
    
    total_items = get_total_count(search, type_filter)
    total_pages = math.ceil(total_items / ITEMS_PER_PAGE)
    
    if page < 1:
        page = 1
    elif page > total_pages and total_pages > 0:
        page = total_pages
    
    columns = get_columns()
    rows = get_paginated_data(page, search, type_filter)
    type_options = get_type_options()
    
    return render_template(
        "index.html",
        columns=columns,
        rows=rows,
        page=page,
        total_pages=total_pages,
        search=search,
        type_filter=type_filter,
        type_options=type_options,
        type_mapping=TYPE_MAPPING,
        total_items=total_items
    )

@app.route("/add", methods=["POST"])
def add():
    """添加记录路由"""
    page = int(request.form.get("page", 1))
    result, errors = insert_row(request.form)
    
    if result:
        flash("添加成功", "success")
    else:
        flash(f"添加失败：{errors}", "danger")
    
    return redirect(f"/?page={page}")

@app.route("/delete/<pk_value>", methods=["DELETE"])
def delete(pk_value):
    """删除记录路由"""
    result, error = delete_row(pk_value)
    
    if result:
        return jsonify({
            "success": True,
            "message": "删除成功"
        })
    else:
        return jsonify({
            "success": False,
            "message": f"删除失败：{error}"
        }), 400

@app.route("/edit/<pk_value>", methods=["GET", "POST"])
def edit(pk_value):
    """编辑记录路由"""
    if request.method == "POST":
        result, errors = update_row(pk_value, request.form)
        if result:
            # 获取更新后的记录
            row = get_row(pk_value)
            columns = get_columns()
            record = dict(zip(columns, row))
            
            return jsonify({
                "success": True,
                "message": "更新成功",
                "record": record,
                "type_mapping": TYPE_MAPPING
            })
        else:
            return jsonify({
                "success": False,
                "message": f"更新失败：{errors}"
            }), 400
    
    return redirect(f"/?page={request.args.get('page', 1)}")

@app.route("/get/<pk_value>")
def get_record(pk_value):
    """获取单条记录路由"""
    row = get_row(pk_value)
    if row:
        columns = get_columns()
        return jsonify(dict(zip(columns, row)))
    return jsonify({"error": "记录不存在"}), 404

@app.route("/export")
def export_data():
    """导出数据路由"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {TABLE_NAME}")
        rows = cursor.fetchall()
        columns = get_columns()
        
        data = []
        for row in rows:
            row_dict = dict(zip(columns, row))
            # 将type转换为数字类型
            if 'type' in row_dict:
                row_dict['type'] = int(row_dict['type'])
            data.append(row_dict)
        
        # 格式化JSON，使用4个空格缩进
        formatted_json = json.dumps(data, ensure_ascii=False, indent=4)
        
        # 直接写入文件到当前目录
        with open('data.json', 'w', encoding='utf-8') as f:
            f.write(formatted_json)
        
        flash("数据已成功导出到 data.json", "success")
        return redirect('/')

@app.route("/swap_positions", methods=["POST"])
def swap_positions():
    """交换两条记录的位置"""
    data = request.get_json()
    id1 = data.get('id1')
    id2 = data.get('id2')
    
    if not id1 or not id2:
        return jsonify({
            "success": False,
            "message": "缺少必要的参数"
        }), 400
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            # 检查两条记录是否存在
            cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME} WHERE id IN (?, ?)", (id1, id2))
            if cursor.fetchone()[0] != 2:
                return jsonify({
                    "success": False,
                    "message": "记录不存在"
                }), 404
            
            # 使用临时ID进行交换
            temp_id = -1  # 使用一个不存在的ID作为临时ID
            
            # 第一步：将第一条记录移动到临时ID
            cursor.execute(f"UPDATE {TABLE_NAME} SET id = ? WHERE id = ?", (temp_id, id1))
            
            # 第二步：将第二条记录移动到第一条记录的位置
            cursor.execute(f"UPDATE {TABLE_NAME} SET id = ? WHERE id = ?", (id1, id2))
            
            # 第三步：将临时ID的记录移动到第二条记录的位置
            cursor.execute(f"UPDATE {TABLE_NAME} SET id = ? WHERE id = ?", (id2, temp_id))
            
            conn.commit()
            return jsonify({
                "success": True,
                "message": "位置交换成功"
            })
        except sqlite3.Error as e:
            conn.rollback()  # 发生错误时回滚事务
            return jsonify({
                "success": False,
                "message": f"交换失败：{str(e)}"
            }), 500

if __name__ == "__main__":
    app.run(debug=True)