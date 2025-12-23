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

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Criar/abrir banco de dados SQLite
const DB_FILE = path.join(__dirname, 'demandas.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados:', err);
        return;
    }
    console.log('✅ Banco de dados SQLite pronto!');
    
    // Verificar se a tabela existe e criar se não existir
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
            isRotina INTEGER DEFAULT 0,
            diasSemana TEXT,
            tag TEXT,
            comentarios TEXT DEFAULT '',
            comentarioGestor TEXT DEFAULT '',
            dataConclusao TEXT,
            atribuidos TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Erro ao criar tabela:', err);
        } else {
            console.log('✅ Tabela demandas verificada/criada com sucesso!');
            
            // Verificar se a coluna atribuidos existe
            db.all("PRAGMA table_info(demandas)", [], (err, columns) => {
                if (err) {
                    console.error('Erro ao verificar colunas:', err);
                    return;
                }
                
                const hasAtribuidosColumn = columns.some(col => col.name === 'atribuidos');
                
                if (!hasAtribuidosColumn) {
                    console.log('📝 Adicionando coluna atribuidos...');
                    db.run("ALTER TABLE demandas ADD COLUMN atribuidos TEXT", (err) => {
                        if (err) {
                            console.error('❌ Erro ao adicionar coluna atribuidos:', err.message);
                        } else {
                            console.log('✅ Coluna atribuidos adicionada com sucesso!');
                        }
                    });
                } else {
                    console.log('✅ Coluna atribuidos já existe!');
                }
            });
        }
    });
});

// Rota principal para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------- ROTAS ------------------

// GET /api/demandas
app.get('/api/demandas', (req, res) => {
    console.log('Recebida requisição GET /api/demandas');
    
    db.all('SELECT * FROM demandas ORDER BY dataCriacao DESC', [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar demandas:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        try {
            // Processar os dados para garantir que 'atribuidos' seja um array
            const processedRows = rows.map(row => {
                // Criar cópia do objeto para evitar mutação
                const processedRow = { ...row };
                
                if (processedRow.atribuidos && typeof processedRow.atribuidos === 'string') {
                    try {
                        processedRow.atribuidos = JSON.parse(processedRow.atribuidos);
                    } catch (e) {
                        console.error('Erro ao parsear atribuidos:', e);
                        processedRow.atribuidos = [];
                    }
                } else if (!processedRow.atribuidos) {
                    processedRow.atribuidos = [];
                }
                
                // Processar diasSemana se existir
                if (processedRow.diasSemana && typeof processedRow.diasSemana === 'string') {
                    try {
                        processedRow.diasSemana = JSON.parse(processedRow.diasSemana);
                    } catch (e) {
                        console.error('Erro ao parsear diasSemana:', e);
                        processedRow.diasSemana = [];
                    }
                }
                
                return processedRow;
            });
            
            console.log(`Retornando ${processedRows.length} demandas`);
            res.json(processedRows);
        } catch (error) {
            console.error('Erro ao processar demandas:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// POST /api/demandas
app.post('/api/demandas', (req, res) => {
    console.log('Recebida requisição POST /api/demandas:', req.body);
    
    try {
        const d = req.body;
        
        // Validação básica
        if (!d.funcionarioId || !d.nomeFuncionario || !d.categoria || !d.prioridade) {
            return res.status(400).json({ 
                success: false, 
                error: 'Campos obrigatórios faltando' 
            });
        }
        
        const sql = `
            INSERT INTO demandas 
            (funcionarioId, nomeFuncionario, emailFuncionario, categoria, prioridade, complexidade, descricao, local, dataCriacao, dataLimite, status, isRotina, diasSemana, tag, comentarios, comentarioGestor, atribuidos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            d.funcionarioId,
            d.nomeFuncionario,
            d.emailFuncionario || '',
            d.categoria,
            d.prioridade,
            d.complexidade || '',
            d.descricao || '',
            d.local || '',
            d.dataCriacao || new Date().toISOString(),
            d.dataLimite,
            d.status || 'pendente',
            d.isRotina ? 1 : 0,
            d.diasSemana ? JSON.stringify(d.diasSemana) : null,
            d.tag || '',
            d.comentarios || '',
            d.comentarioGestor || '',
            d.atribuidos ? JSON.stringify(d.atribuidos) : null
        ];
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Erro ao inserir demanda:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            console.log(`Demanda inserida com ID: ${this.lastID}`);
            res.json({ success: true, demanda: { id: this.lastID, ...d, dataCriacao: params[8] } });
        });
    } catch (error) {
        console.error('Erro ao processar requisição POST:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/demandas/:id
app.put('/api/demandas/:id', (req, res) => {
    console.log('Recebida requisição PUT /api/demandas/:id:', req.params.id, req.body);
    
    try {
        const d = req.body;
        const id = req.params.id;
        
        // Validação básica
        if (!id || isNaN(id)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID inválido' 
            });
        }
        
        const sql = `
            UPDATE demandas SET
            funcionarioId = ?, nomeFuncionario = ?, emailFuncionario = ?, categoria = ?, prioridade = ?, complexidade = ?, descricao = ?, local = ?, dataLimite = ?, status = ?, isRotina = ?, diasSemana = ?, tag = ?, comentarios = ?, comentarioGestor = ?, dataConclusao = ?, atribuidos = ?
            WHERE id = ?
        `;
        
        const params = [
            d.funcionarioId,
            d.nomeFuncionario,
            d.emailFuncionario || '',
            d.categoria,
            d.prioridade,
            d.complexidade || '',
            d.descricao || '',
            d.local || '',
            d.dataLimite,
            d.status,
            d.isRotina ? 1 : 0,
            d.diasSemana ? JSON.stringify(d.diasSemana) : null,
            d.tag || '',
            d.comentarios || '',
            d.comentarioGestor || '',
            d.dataConclusao || null,
            d.atribuidos ? JSON.stringify(d.atribuidos) : null,
            id
        ];
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Erro ao atualizar demanda:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            console.log(`Demanda ${id} atualizada com sucesso`);
            res.json({ success: true, demanda: { id: Number(id), ...d } });
        });
    } catch (error) {
        console.error('Erro ao processar requisição PUT:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/demandas/:id
app.delete('/api/demandas/:id', (req, res) => {
    console.log('Recebida requisição DELETE /api/demandas/:id:', req.params.id);
    
    try {
        const id = req.params.id;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID inválido' 
            });
        }
        
        db.run('DELETE FROM demandas WHERE id = ?', [id], function(err) {
            if (err) {
                console.error('Erro ao deletar demanda:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            console.log(`Demanda ${id} deletada com sucesso`);
            res.json({ success: true });
        });
    } catch (error) {
        console.error('Erro ao processar requisição DELETE:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/demandas/funcionario/:id
app.get('/api/demandas/funcionario/:id', (req, res) => {
    console.log('Recebida requisição GET /api/demandas/funcionario/:id:', req.params.id);
    
    try {
        const id = req.params.id;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID inválido' 
            });
        }
        
        db.all('SELECT * FROM demandas WHERE funcionarioId = ? OR atribuidos LIKE ? ORDER BY dataCriacao DESC', [id, `%"id":${id}%`], (err, rows) => {
            if (err) {
                console.error('Erro ao buscar demandas do funcionário:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            // Processar os dados
            const processedRows = rows.map(row => {
                const processedRow = { ...row };
                
                if (processedRow.atribuidos && typeof processedRow.atribuidos === 'string') {
                    try {
                        processedRow.atribuidos = JSON.parse(processedRow.atribuidos);
                    } catch (e) {
                        console.error('Erro ao parsear atribuidos:', e);
                        processedRow.atribuidos = [];
                    }
                } else if (!processedRow.atribuidos) {
                    processedRow.atribuidos = [];
                }
                
                return processedRow;
            });
            
            console.log(`Retornando ${processedRows.length} demandas para o funcionário ${id}`);
            res.json(processedRows);
        });
    } catch (error) {
        console.error('Erro ao processar requisição GET funcionário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/demandas/status/:status
app.get('/api/demandas/status/:status', (req, res) => {
    console.log('Recebida requisição GET /api/demandas/status/:status:', req.params.status);
    
    try {
        const status = req.params.status;
        
        if (!status) {
            return res.status(400).json({ 
                success: false, 
                error: 'Status não fornecido' 
            });
        }
        
        db.all('SELECT * FROM demandas WHERE status = ? ORDER BY dataCriacao DESC', [status], (err, rows) => {
            if (err) {
                console.error('Erro ao buscar demandas por status:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            // Processar os dados
            const processedRows = rows.map(row => {
                const processedRow = { ...row };
                
                if (processedRow.atribuidos && typeof processedRow.atribuidos === 'string') {
                    try {
                        processedRow.atribuidos = JSON.parse(processedRow.atribuidos);
                    } catch (e) {
                        console.error('Erro ao parsear atribuidos:', e);
                        processedRow.atribuidos = [];
                    }
                } else if (!processedRow.atribuidos) {
                    processedRow.atribuidos = [];
                }
                
                return processedRow;
            });
            
            console.log(`Retornando ${processedRows.length} demandas com status ${status}`);
            res.json(processedRows);
        });
    } catch (error) {
        console.error('Erro ao processar requisição GET status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
    console.log('Recebida requisição GET /api/stats');
    
    try {
        const stats = {};
        
        // Contagem por status
        db.all('SELECT status, COUNT(*) as count FROM demandas GROUP BY status', [], (err, rows) => {
            if (err) {
                console.error('Erro ao buscar estatísticas:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            rows.forEach(row => {
                stats[row.status] = row.count;
            });
            
            // Contagem total
            db.get('SELECT COUNT(*) as total FROM demandas', [], (err, row) => {
                if (err) {
                    console.error('Erro ao buscar total:', err);
                    return res.status(500).json({ success: false, error: err.message });
                }
                
                stats.total = row.total;
                console.log('Estatísticas:', stats);
                res.json({ success: true, stats });
            });
        });
    } catch (error) {
        console.error('Erro ao processar requisição GET stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    console.log('Recebida requisição GET /health');
    
    db.get('SELECT COUNT(*) as count FROM demandas', [], (err, row) => {
        if (err) {
            console.error('Erro no health check:', err);
            return res.status(500).json({ status: 'ERROR', error: err.message });
        }
        
        console.log(`Health check OK - ${row.count} demandas no banco`);
        res.json({ status: 'OK', demandas: row.count });
    });
});

// Middleware para tratamento de erros 404
app.use((req, res) => {
    console.log(`Rota não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// Middleware para tratamento de erros gerais
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado em porta ${PORT}`);
    console.log(`🌐 Acesse em: http://localhost:${PORT}`);
    console.log(`📊 Banco de dados: ${DB_FILE}`);
});
