//Pacotes externos utilizados na aplicação
import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";

const app = express();
const port = 3000;
const saltRounds = 2;

//Middlewares
app.use(bodyParser.urlencoded({ extended: true })); //Utilizar Body-Parser para acessar o corpo da requisição através de req.
app.use(express.static("public")); //Define para o express em qual diretório estão os arquivos estáticos da aplicação

//Configuração do middleware Express-Session para permanência de sessão (30 minutos)
app.use(
    session({
        secret: "TOPSECRETWORD",
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 1000 * 60 * 30
        }
      })
    );

//Inicializa o middleware do passport e a sessão declarada previamente
app.use(passport.initialize());
app.use(passport.session());    

//Iniciar client para acessar o banco de dados
const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "projeto_tabelas",
    password: "Roque@28",
    port: 5432,
});

db.connect();

//Funções CRUD banco de dados
async function getServicos() {
    const result = await db.query("SELECT * FROM servicos");
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

async function adicionaAtendimento(){
    await db.query("INSERT INTO atendimentos (usuario.id, valor_adicional, valor_total, data) VALUES ($1, $2, $3, $4)",
        [descricao, preco]);
}

//
// ENDPOINTS
//

app.get("/", async (req, res) => {

    if(req.isAuthenticated()){

        const servicos = await getServicos();
        const metodosPagamento = await getMetodosPagamento();
        console.log(req.user);

        res.render("home.ejs", {user: req.user, servicos, metodosPagamento});
    } else {
        res.redirect("/login")
    }

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

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login"
}));

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

app.post("/novoUsuario", async (req, res) =>{
    const novoLogin = req.body.novoLogin;
    const novaSenha = req.body.novaSenha;

    console.log(req.body);

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

app.post("/novoAtendimento", async(req,res) =>{
    console.log(req.body);
    res.redirect("/");
})

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
                        return cb(null, false)
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

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  