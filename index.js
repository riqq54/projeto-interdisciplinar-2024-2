//Pacotes externos utilizados na aplicação
import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env, { config } from "dotenv";

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 2;
env.config();

//Middlewares - BodyParser (req.body) e localização dos arquivos estáticos
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.static("public"));

//Middleware - Express-Session para permanência de sessão (30 minutos)
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 30
        }
      })
    );

//Middleware - Passport e a sessão declarada previamente
app.use(passport.initialize());
app.use(passport.session());

//Middlware - Mensagens Flash
app.use((req, res, next)=>{
    res.locals.message = req.session.message
    delete req.session.message
    next()
})

//Iniciar client para acessar o banco de dados
let configdb = null;

if (process.env.NODE_ENV === "production")
    configdb = {connectionString: process.env.DATABASE_URL}
else
    configdb = {
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DATABASE,
        password: process.env.PG_PASSWORD,
        port: process.env.PG_PORT,
    }

const db = new pg.Client(configdb);

db.connect();




//
//Funções de consulta ao banco de dados
//
async function getServicos() {
    const result = await db.query("SELECT * FROM servicos ORDER BY id ASC");
    return result.rows;
}

async function getUsuarios(){
    const result = await db.query("SELECT usuarios.*, perfis.nome AS perfil_nome FROM usuarios JOIN perfis ON usuarios.perfil = perfis.id ORDER BY usuarios.id ASC");
    return result.rows;
}

async function getPerfis() {
    const result = await db.query("SELECT * FROM perfis");
    return result.rows;
}

async function getMetodosPagamento() {
    const result = await db.query("SELECT * FROM metodos_pagamento");
    return result.rows;     
}

async function getMeusAtendimentos(user_id){
    const result = await db.query(
        "SELECT atendimentos.id, usuarios.login, TO_CHAR(atendimentos.data, 'dd/mm/yyyy') AS data, atendimentos.valor_adicional, atendimentos.valor_total, metodos_pagamento.descricao AS metodo_pagamento FROM atendimentos JOIN usuarios ON usuarios.id = atendimentos.usuario JOIN metodos_pagamento ON metodos_pagamento.id = atendimentos.metodo_pagamento WHERE usuarios.id = $1",
        [user_id]);

    return result.rows;
}

async function getTodosAtendimentos(){
    const result = await db.query(
        "SELECT atendimentos.id, usuarios.nome, usuarios.sobrenome, TO_CHAR(atendimentos.data, 'dd/mm/yyyy') AS data, atendimentos.valor_adicional, atendimentos.valor_total, metodos_pagamento.descricao AS metodo_pagamento FROM atendimentos JOIN usuarios ON usuarios.id = atendimentos.usuario JOIN metodos_pagamento ON metodos_pagamento.id = atendimentos.metodo_pagamento");
    return result.rows;
}




//
// ENDPOINTS
//

//
//HTTP - GET
//
app.get("/", async (req, res) => {

    if(req.isAuthenticated()){

        const servicos = await getServicos();
        const metodosPagamento = await getMetodosPagamento();
        // console.log(req.user);

        res.render("home.ejs", {user: req.user, servicos, metodosPagamento});
    } else {
        res.redirect("/login")
    }

});

app.get("/atendimentos", async (req, res) => {

    if(req.isAuthenticated()){

        const user_id = req.user.id;

        const meusAtendimentos = await getMeusAtendimentos(user_id); 

        res.render("atendimentos.ejs", {user: req.user, meusAtendimentos});
    } else {
        res.redirect("/login")
    }

});

app.get("/relatorios", async (req, res) => {

    if(!req.isAuthenticated){
        res.redirect("/login")
    }

    if(req.user.perfil != 1){
        res.redirect("/")
    }

    const todosAtendimentos = await getTodosAtendimentos();
    // console.log(todosAtendimentos);

    res.render("relatorios.ejs", {user: req.user, todosAtendimentos});

});

app.get("/servicos", async (req,res)=>{
    if(req.isAuthenticated()){

        const servicos = await getServicos();
        // console.log(servicos);

        res.render("servicos.ejs", {user: req.user, servicos});
    } else {
        res.redirect("/login")
    }
})

app.get("/acessos", async (req,res)=>{
    if(req.isAuthenticated()){

        const usuarios = await getUsuarios();
        const perfis = await getPerfis();        

        res.render("acessos.ejs", {user: req.user, usuarios, perfis});
    } else {
        res.redirect("/login")
    }
})

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
});

//
//HTTP - POST
//

//Login (Autenticação)
app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureMessage: true
}));

//Serviços
app.post("/novoServico", async (req, res) =>{

    const descricao = req.body.descricao;
    const preco = req.body.preco.replace(",",".");
    
    try {
        await db.query("INSERT INTO servicos (descricao, preco) VALUES ($1, $2)",[descricao, preco]);
        res.redirect("/servicos")
    } catch (err) {
        console.log(err);
        res.redirect("/servicos")
    }
});

app.post("/removerServico/:id", async (req, res) =>{

    // console.log(req.params.id)
    const idServico = req.params.id;

    try {
        await db.query("DELETE FROM servicos WHERE id = $1", [idServico])
        res.redirect("/servicos")
        
    } catch (err) {
        console.log(err);
        res.redirect("/servicos")
    }
})


//Usuários
app.post("/novoUsuario", async (req, res) =>{
    const novoLogin = req.body.novoLogin;
    const novaSenha = req.body.novaSenha;

    // console.log(req.body);

    try {

        const checkResult = await db.query("SELECT * FROM usuarios WHERE login = $1", [novoLogin]);
        // console.log(checkResult);
        
        if (checkResult.rowCount > 0) {

            console.log("Login já existe."); //Handle com req.flash
            res.redirect("/acessos");

        } else {
            bcrypt.hash(novaSenha, saltRounds, async(err, hash)=>{
                if(err){
                    console.error("Erro ao realizar Hash da senha: ", err)
                } else {
                    // console.log("Senha após Hash:", hash);
                    await db.query(
                        "INSERT INTO usuarios (nome, sobrenome, cpf, celular, email, login, senha, perfil, dataNasc, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                        [req.body.nome, req.body.sobrenome, req.body.cpf, req.body.celular, req.body.email, novoLogin, hash, req.body.perfil, req.body.dataNasc, "true"]
                    );
                    res.redirect("/acessos");
                    // res.send("Usuário criado com sucesso!");
                }
            })
        }
        
    } catch (error) {
        console.log(error);
    }

})

app.post("/alterarSituacao/:id", async (req, res) =>{

    // console.log(req.params.id)
    const idUsuario = req.params.id;
    let situacao = req.body.ativo;

    if (situacao == 'false') {
        situacao = false;
    } else {
        situacao = true;
    }
    
    try {
        await db.query("UPDATE usuarios SET ativo = $1 WHERE id = $2", [!situacao, idUsuario])
        res.redirect("/acessos")
        
    } catch (err) {
        console.log(err);
        res.redirect("/acessos")
    }
})


//Atendimentos
app.post("/novoAtendimento", async (req,res) =>{

    console.log(req.body);

    let valorTotal = 0;

    const servicosPrestados = Array.from(req.body.servicosPrestados);

    const servicos = await getServicos();

    servicosPrestados.forEach(servicoPrestado => {
        const servicoIndex = servicos.findIndex((servico) => servico.id == servicoPrestado)
        valorTotal += parseFloat(servicos[servicoIndex].preco);
    });

    let valorAdicional = req.body.valorAdicional.replace(",",".");
    
    if(!valorAdicional){
        valorAdicional = 0;
    }

    // console.log(valorTotal);
    
    try {

        const result = await db.query("INSERT INTO atendimentos (usuario, valor_adicional, valor_total, data, metodo_pagamento) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [req.body.userID, valorAdicional, valorTotal, new Date, req.body.metodoPagamento]);
            
            const atendimentoID = result.rows[0].id;
            // console.log(atendimentoID);
            
            try {

                for (const s of servicosPrestados) {
                    
                    await db.query("INSERT INTO atendimentos_servicos (atendimento, servico) VALUES ($1, $2)",
                                [atendimentoID, s]);
                }
                
            } catch (error) {
                console.log(error);
                res.redirect("/")
            }

    } catch (err) {

        console.log(err);
        res.redirect("/")
    }

    res.redirect("/");
})



//
//Passport - Estratégia de Autenticação
//
passport.use(new Strategy(async function verify(username, password, cb){

    try {
        const result = await db.query("SELECT * FROM usuarios WHERE login = $1", [username]);
        // console.log(result);
        
        if (result.rowCount > 0) {
            const user = result.rows[0];
            const senhaHashArmazenada = user.senha;

            if (user.ativo == false) {
                return cb(null, false)
                //res.send("Usuário Desativado.")
            }

            bcrypt.compare(password, senhaHashArmazenada, (err, result) =>{
                if(err){
                    return cb(err)
                    //console.error("Erro ao comparar senhas: ", err)
                }else{
                    if(result){
                        return cb(null, user)
                    } else{
                        return cb(null, false, {message: 'Por favor tente novamente'})
                        //res.send("Senha Incorreta"); //Handle dps
                    }
                }
            })

        } else {
            return cb("Usuário não encontrado")//Handle dps
        }
    } catch (err) {
        console.error(err)
    }

}))

passport.serializeUser((user, cb) =>{
    cb(null, user);
})

passport.deserializeUser((user, cb) =>{
    cb(null, user);
})

//Inicia o servidor
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  