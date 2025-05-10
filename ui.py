from flask import (
    Flask, request, render_template_string, 
    redirect, flash, jsonify, make_response
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
    '6': '文档教程'
}

# 类型显示顺序
TYPE_DISPLAY_ORDER = ['1', '2', '3', '4', '5', '6']


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


HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>数据管理系统</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        .table-responsive { overflow-x: auto; }
        .modal-lg { max-width: 800px; }
        .id-column { width: 80px; min-width: 80px; }
        .url-column { text-align: left; min-width: 200px; }
        .type-column { width: 120px; min-width: 120px; }
        .name-column { width: 150px; min-width: 150px; }
        .desc-column { width: 200px; min-width: 200px; }
        th, td { 
            text-align: center; 
            vertical-align: middle;
            white-space: nowrap;
            padding: 8px;
        }
        tr.dragging { opacity: 0.5; background-color: #f8f9fa; }
        tr.drag-over { border-top: 2px solid #007bff; }
        .drag-handle { cursor: move; color: #999; padding: 0 5px; }
        .drag-handle:hover { color: #666; }
        .drag-handle::before { content: "⋮⋮"; }
        .table { table-layout: fixed; }
    </style>
</head>
<body class="container mt-4">
    {% with messages = get_flashed_messages(with_categories=true) %}
        {% if messages %}
            {% for category, message in messages %}
                <div class="alert alert-{{ category }} alert-dismissible fade show" role="alert">
                    {{ message }}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            {% endfor %}
        {% endif %}
    {% endwith %}

    <h2 class="mb-4">数据记录 (第 {{ page }} 页，共 {{ total_pages }} 页，总计 {{ total_items }} 条记录)</h2>
    
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <button type="button" class="btn btn-success" onclick="showAddModal()">
                添加新记录
            </button>
            <a href="/export" class="btn btn-primary ms-2">
                导出数据
            </a>
        </div>
        
        <form method="get" class="row gx-2">
            <div class="col">
                <input type="text" name="search" value="{{ search or '' }}" 
                       placeholder="搜索..." class="form-control">
            </div>
            <div class="col">
                <select name="type" class="form-select">
                    <option value="">所有类型</option>
                    {% for t in type_options %}
                        <option value="{{ t }}" {% if t == type_filter %}selected{% endif %}>
                            {{ type_mapping.get(t, t) }}
                        </option>
                    {% endfor %}
                </select>
            </div>
            <div class="col-auto">
                <button type="submit" class="btn btn-primary">筛选</button>
                <a href="/" class="btn btn-secondary">重置</a>
            </div>
        </form>
    </div>

    <div class="table-responsive">
        <table class="table table-bordered table-striped">
            <thead class="table-dark">
                <tr>
                    {% for col in columns %}
                        <th {% if col == 'id' %}class="id-column"{% endif %}
                            {% if col == 'url' %}class="url-column"{% endif %}
                            {% if col == 'type' %}class="type-column"{% endif %}
                            {% if col == 'name' %}class="name-column"{% endif %}
                            {% if col == 'desc' %}class="desc-column"{% endif %}>
                            {{ col }}
                        </th>
                    {% endfor %}
                    <th style="width: 120px;">操作</th>
                </tr>
            </thead>
            <tbody>
                {% for row in rows %}
                <tr data-id="{{ row[0] }}">
                    <td class="id-column">
                        <span class="drag-handle"></span>
                        {{ row[0] }}
                    </td>
                    {% for cell in row[1:] %}
                        <td {% if columns[loop.index0 + 1] == 'url' %}class="url-column"{% endif %}
                            {% if columns[loop.index0 + 1] == 'type' %}class="type-column"{% endif %}
                            {% if columns[loop.index0 + 1] == 'name' %}class="name-column"{% endif %}
                            {% if columns[loop.index0 + 1] == 'desc' %}class="desc-column"{% endif %}>
                            {% if columns[loop.index0 + 1] == 'url' %}
                                <a href="{{ cell }}" target="_blank" rel="noopener noreferrer">{{ cell }}</a>
                            {% elif columns[loop.index0 + 1] == 'type' %}
                                {{ type_mapping.get(cell, cell) }}
                            {% else %}
                                {{ cell }}
                            {% endif %}
                        </td>
                    {% endfor %}
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editRecord('{{ row[0] }}')">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteRecord('{{ row[0] }}')">删除</button>
                    </td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>

    <nav aria-label="分页导航">
        <ul class="pagination justify-content-center">
            {% if page > 1 %}
                <li class="page-item">
                    <a class="page-link" href="/?page={{ page - 1 }}&search={{ search }}&type={{ type_filter }}">
                        上一页
                    </a>
                </li>
            {% endif %}
            
            {% for p in range(1, total_pages + 1) %}
                <li class="page-item {% if p == page %}active{% endif %}">
                    <a class="page-link" href="/?page={{ p }}&search={{ search }}&type={{ type_filter }}">
                        {{ p }}
                    </a>
                </li>
            {% endfor %}
            
            {% if page < total_pages %}
                <li class="page-item">
                    <a class="page-link" href="/?page={{ page + 1 }}&search={{ search }}&type={{ type_filter }}">
                        下一页
                    </a>
                </li>
            {% endif %}
        </ul>
    </nav>

    <!-- 添加记录模态框 -->
    <div class="modal fade" id="addModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">添加新记录</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form method="POST" action="/add" id="addForm">
                    <div class="modal-body">
                        {% for col in columns %}
                            {% if col != 'id' %}
                            <div class="mb-3">
                                <label for="add_{{ col }}" class="form-label">{{ col }}</label>
                                {% if col == 'type' %}
                                <select name="{{ col }}" class="form-select" id="add_{{ col }}" required>
                                    {% for t in type_options %}
                                        <option value="{{ t }}">{{ type_mapping.get(t, t) }}</option>
                                    {% endfor %}
                                </select>
                                {% else %}
                                <input type="text" name="{{ col }}" class="form-control" 
                                       id="add_{{ col }}" required>
                                {% endif %}
                            </div>
                            {% endif %}
                        {% endfor %}
                        <input type="hidden" name="page" value="{{ page }}">
                    </div>
                    <div class="modal-footer">
                        <button type="submit" class="btn btn-success">添加</button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            取消
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- 编辑记录模态框 -->
    <div class="modal fade" id="editModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">编辑记录</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form method="POST" id="editForm">
                    <div class="modal-body">
                        {% for col in columns %}
                            {% if col != 'id' %}
                            <div class="mb-3">
                                <label for="edit_{{ col }}" class="form-label">{{ col }}</label>
                                {% if col == 'type' %}
                                <select name="{{ col }}" class="form-select" id="edit_{{ col }}" required>
                                    {% for t in type_options %}
                                        <option value="{{ t }}">{{ type_mapping.get(t, t) }}</option>
                                    {% endfor %}
                                </select>
                                {% else %}
                                <input type="text" name="{{ col }}" class="form-control" 
                                       id="edit_{{ col }}" required>
                                {% endif %}
                            </div>
                            {% endif %}
                        {% endfor %}
                        <input type="hidden" name="page" value="{{ page }}">
                    </div>
                    <div class="modal-footer">
                        <button type="submit" class="btn btn-primary">保存</button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            取消
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        function showAddModal() {
            new bootstrap.Modal(document.getElementById('addModal')).show();
        }

        function editRecord(id) {
            fetch(`/get/${id}`)
                .then(response => response.json())
                .then(data => {
                    const form = document.getElementById('editForm');
                    form.action = `/edit/${id}`;
                    
                    Object.keys(data).forEach(key => {
                        const input = document.getElementById(`edit_${key}`);
                        if (input) input.value = data[key];
                    });
                    
                    new bootstrap.Modal(document.getElementById('editModal')).show();
                });
        }

        // 添加编辑表单提交处理
        document.getElementById('editForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const id = this.action.split('/').pop();
            
            fetch(`/edit/${id}`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 关闭模态框
                    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
                    
                    // 更新表格中的对应行
                    const row = document.querySelector(`tr[data-id="${id}"]`);
                    if (row) {
                        const cells = row.querySelectorAll('td');
                        Object.keys(data.record).forEach((key, index) => {
                            if (index < cells.length - 1) { // 排除最后一列的操作按钮
                                if (key === 'url') {
                                    cells[index].innerHTML = `<a href="${data.record[key]}" target="_blank" rel="noopener noreferrer">${data.record[key]}</a>`;
                                } else if (key === 'type') {
                                    cells[index].textContent = data.type_mapping[data.record[key]] || data.record[key];
                                } else {
                                    cells[index].textContent = data.record[key];
                                }
                            }
                        });
                    }
                    
                    // 显示成功消息
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-success alert-dismissible fade show';
                    alertDiv.innerHTML = `
                        ${data.message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    `;
                    document.querySelector('.container').insertBefore(
                        alertDiv,
                        document.querySelector('h2')
                    );
                } else {
                    // 显示错误消息
                    const alertDiv = document.createElement('div');
                    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
                    alertDiv.innerHTML = `
                        ${data.message}
                        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                    `;
                    document.querySelector('.container').insertBefore(
                        alertDiv,
                        document.querySelector('h2')
                    );
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        });

        function deleteRecord(id) {
            if (confirm('确定要删除这条记录吗？')) {
                fetch(`/delete/${id}`, {
                    method: 'DELETE'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // 删除成功后移除对应的表格行
                        const row = document.querySelector(`tr[data-id="${id}"]`);
                        if (row) {
                            row.remove();
                        }
                        // 显示成功消息
                        const alertDiv = document.createElement('div');
                        alertDiv.className = 'alert alert-success alert-dismissible fade show';
                        alertDiv.innerHTML = `
                            ${data.message}
                            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                        `;
                        document.querySelector('.container').insertBefore(
                            alertDiv,
                            document.querySelector('h2')
                        );
                    } else {
                        // 显示错误消息
                        const alertDiv = document.createElement('div');
                        alertDiv.className = 'alert alert-danger alert-dismissible fade show';
                        alertDiv.innerHTML = `
                            ${data.message}
                            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                        `;
                        document.querySelector('.container').insertBefore(
                            alertDiv,
                            document.querySelector('h2')
                        );
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                });
            }
        }

        // 添加拖拽相关代码
        document.addEventListener('DOMContentLoaded', function() {
            const tbody = document.querySelector('tbody');
            let draggedRow = null;
            let draggedIndex = -1;

            tbody.addEventListener('dragstart', function(e) {
                if (e.target.closest('tr')) {
                    draggedRow = e.target.closest('tr');
                    draggedIndex = Array.from(tbody.children).indexOf(draggedRow);
                    draggedRow.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                }
            });

            tbody.addEventListener('dragend', function(e) {
                if (draggedRow) {
                    draggedRow.classList.remove('dragging');
                    draggedRow = null;
                    draggedIndex = -1;
                }
            });

            tbody.addEventListener('dragover', function(e) {
                e.preventDefault();
                const targetRow = e.target.closest('tr');
                if (targetRow && targetRow !== draggedRow) {
                    targetRow.classList.add('drag-over');
                }
            });

            tbody.addEventListener('dragleave', function(e) {
                const targetRow = e.target.closest('tr');
                if (targetRow) {
                    targetRow.classList.remove('drag-over');
                }
            });

            tbody.addEventListener('drop', function(e) {
                e.preventDefault();
                const targetRow = e.target.closest('tr');
                if (targetRow && draggedRow && targetRow !== draggedRow) {
                    targetRow.classList.remove('drag-over');
                    
                    // 发送交换请求到服务器
                    fetch('/swap_positions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            id1: draggedRow.dataset.id,
                            id2: targetRow.dataset.id
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            // 交换成功，刷新页面以显示新顺序
                            window.location.reload();
                        } else {
                            // 显示错误消息
                            const alertDiv = document.createElement('div');
                            alertDiv.className = 'alert alert-danger alert-dismissible fade show';
                            alertDiv.innerHTML = `
                                ${data.message}
                                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                            `;
                            document.querySelector('.container').insertBefore(
                                alertDiv,
                                document.querySelector('h2')
                            );
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                    });
                }
            });

            // 为所有行添加拖拽属性
            document.querySelectorAll('tbody tr').forEach(row => {
                row.setAttribute('draggable', 'true');
            });
        });
    </script>
</body>
</html>
"""

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
    
    return render_template_string(
        HTML_TEMPLATE,
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