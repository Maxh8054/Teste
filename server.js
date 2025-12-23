const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Criar/abrir banco de dados SQLite
const DB_FILE = path.join(__dirname, 'demandas.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) return console.error('Erro ao abrir o banco de dados:', err);
    console.log('✅ Banco de dados SQLite pronto!');
    
    // Verificar se a coluna 'atribuidos' existe, e adicionar se não existir
    db.all("PRAGMA table_info(demandas)", [], (err, columns) => {
        if (err) return console.error('Erro ao verificar colunas:', err);
        
        const hasAtribuidosColumn = columns.some(col => col.name === 'atribuidos');
        
        if (!hasAtribuidosColumn) {
            console.log('Adicionando coluna atribuidos...');
            db.run("ALTER TABLE demandas ADD COLUMN atribuidos TEXT", (err) => {
                if (err) console.error('Erro ao adicionar coluna atribuidos:', err);
                else console.log('✅ Coluna atribuidos adicionada com sucesso!');
            });
        }
    });
});

// Criar tabela de demandas se não existir
db.run(`
    CREATE TABLE IF NOT EXISTS demandas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionarioId INTEGER,
        nomeFuncionario TEXT,
        emailFuncionario TEXT,
        categoria TEXT,
        prioridade TEXT,
        complexidade TEXT,
        descricao TEXT,
        local TEXT,
        dataCriacao TEXT,
        dataLimite TEXT,
        status TEXT,
        isRotina INTEGER,
        diasSemana TEXT,
        tag TEXT,
        comentarios TEXT,
        comentarioGestor TEXT,
        dataConclusao TEXT,
        atribuidos TEXT
    )
`);

// Rota principal para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------- ROTAS ------------------

// GET /api/demandas
app.get('/api/demandas', (req, res) => {
    db.all('SELECT * FROM demandas', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // Processar os dados para garantir que 'atribuidos' seja um array
        const processedRows = rows.map(row => {
            if (row.atribuidos && typeof row.atribuidos === 'string') {
                try {
                    row.atribuidos = JSON.parse(row.atribuidos);
                } catch (e) {
                    console.error('Erro ao parsear atribuidos:', e);
                    row.atribuidos = [];
                }
            } else if (!row.atribuidos) {
                row.atribuidos = [];
            }
            
            // Processar diasSemana se existir
            if (row.diasSemana && typeof row.diasSemana === 'string') {
                try {
                    row.diasSemana = JSON.parse(row.diasSemana);
                } catch (e) {
                    console.error('Erro ao parsear diasSemana:', e);
                    row.diasSemana = [];
                }
            }
            
            return row;
        });
        
        res.json(processedRows);
    });
});

// POST /api/demandas
app.post('/api/demandas', (req, res) => {
    const d = req.body;
    
    const sql = `
        INSERT INTO demandas 
        (funcionarioId, nomeFuncionario, emailFuncionario, categoria, prioridade, complexidade, descricao, local, dataCriacao, dataLimite, status, isRotina, diasSemana, tag, comentarios, comentarioGestor, atribuidos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        d.funcionarioId,
        d.nomeFuncionario,
        d.emailFuncionario,
        d.categoria,
        d.prioridade,
        d.complexidade,
        d.descricao,
        d.local,
        d.dataCriacao || new Date().toISOString(),
        d.dataLimite,
        d.status || 'pendente',
        d.isRotina ? 1 : 0,
        d.diasSemana ? JSON.stringify(d.diasSemana) : null,
        d.tag,
        d.comentarios || '',
        d.comentarioGestor || '',
        d.atribuidos ? JSON.stringify(d.atribuidos) : null
    ];
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, demanda: { id: this.lastID, ...d, dataCriacao: params[8] } });
    });
});

// PUT /api/demandas/:id
app.put('/api/demandas/:id', (req, res) => {
    const d = req.body;
    const id = req.params.id;
    
    const sql = `
        UPDATE demandas SET
        funcionarioId = ?, nomeFuncionario = ?, emailFuncionario = ?, categoria = ?, prioridade = ?, complexidade = ?, descricao = ?, local = ?, dataLimite = ?, status = ?, isRotina = ?, diasSemana = ?, tag = ?, comentarios = ?, comentarioGestor = ?, dataConclusao = ?, atribuidos = ?
        WHERE id = ?
    `;
    
    const params = [
        d.funcionarioId,
        d.nomeFuncionario,
        d.emailFuncionario,
        d.categoria,
        d.prioridade,
        d.complexidade,
        d.descricao,
        d.local,
        d.dataLimite,
        d.status,
        d.isRotina ? 1 : 0,
        d.diasSemana ? JSON.stringify(d.diasSemana) : null,
        d.tag,
        d.comentarios || '',
        d.comentarioGestor || '',
        d.dataConclusao || null,
        d.atribuidos ? JSON.stringify(d.atribuidos) : null,
        id
    ];
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, demanda: { id: Number(id), ...d } });
    });
});

// DELETE /api/demandas/:id
app.delete('/api/demandas/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM demandas WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// GET /api/demandas/funcionario/:id - Nova rota para obter demandas de um funcionário específico
app.get('/api/demandas/funcionario/:id', (req, res) => {
    const id = req.params.id;
    
    db.all('SELECT * FROM demandas WHERE funcionarioId = ? OR atribuidos LIKE ?', [id, `%"id":${id}%`], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // Processar os dados para garantir que 'atribuidos' seja um array
        const processedRows = rows.map(row => {
            if (row.atribuidos && typeof row.atribuidos === 'string') {
                try {
                    row.atribuidos = JSON.parse(row.atribuidos);
                } catch (e) {
                    console.error('Erro ao parsear atribuidos:', e);
                    row.atribuidos = [];
                }
            } else if (!row.atribuidos) {
                row.atribuidos = [];
            }
            
            // Processar diasSemana se existir
            if (row.diasSemana && typeof row.diasSemana === 'string') {
                try {
                    row.diasSemana = JSON.parse(row.diasSemana);
                } catch (e) {
                    console.error('Erro ao parsear diasSemana:', e);
                    row.diasSemana = [];
                }
            }
            
            return row;
        });
        
        res.json(processedRows);
    });
});

// GET /api/demandas/status/:status - Nova rota para obter demandas por status
app.get('/api/demandas/status/:status', (req, res) => {
    const status = req.params.status;
    
    db.all('SELECT * FROM demandas WHERE status = ?', [status], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // Processar os dados para garantir que 'atribuidos' seja um array
        const processedRows = rows.map(row => {
            if (row.atribuidos && typeof row.atribuidos === 'string') {
                try {
                    row.atribuidos = JSON.parse(row.atribuidos);
                } catch (e) {
                    console.error('Erro ao parsear atribuidos:', e);
                    row.atribuidos = [];
                }
            } else if (!row.atribuidos) {
                row.atribuidos = [];
            }
            
            return row;
        });
        
        res.json(processedRows);
    });
});

// Health check
app.get('/health', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM demandas', [], (err, row) => {
        if (err) return res.status(500).json({ status: 'ERROR', error: err.message });
        res.json({ status: 'OK', demandas: row.count });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado em porta ${PORT}`);
});