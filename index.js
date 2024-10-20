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
    database: "pi",
    password: "Roque@28",
    port: 5432,
});

db.connect();

async function getServicos() {
    const result = await db.query("SELECT * FROM servicos");
    return result.rows;
}

//
// ENDPOINTS
//

app.get("/", (req, res) => {

    if(req.isAuthenticated()){
        res.render("home.ejs", {user: req.user});
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

app.get("/acessos", (req,res)=>{
    if(req.isAuthenticated()){

        res.render("servicos.ejs", {user: req.user});
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

// app.post("/register", async (req,res) => {
//     const email = req.body.username;
//     const password = req.body.password;

//     try {
//         const checkResult = await db.query ("SELECT * FROM usuarios WHERE username = $1", [
//             email,
//         ]);
        
//         if (checkResult.rows.length > 0) {
//             res.send("Usuário já existe. Tente fazer o login.")
//         }else{
//             bcrypt.hash(password, saltRounds, async(err, hash)=>{
//                 if(err){
//                     console.error("Erro ao realizar Hash da senha: ", err)
//                 } else {
//                     // console.log("Senha após Hash:", hash);
//                     await db.query(
//                         "INSERT INTO usuarios (username, password) VALUES ($1, $2)",
//                         [email, hash]
//                     );

//                     res.render("login.ejs");
//                 }
//             })
//         }

//     } catch (err) {
//         console.log(err);
//     }
// });

passport.use(new Strategy(async function verify(username, password, cb){

    try {
        const result = await db.query("SELECT * FROM usuarios WHERE username = $1", [username]);
        // console.log(result);
        
        if (result.rowCount > 0) {
            const user = result.rows[0];
            const senhaHashArmazenada = user.password;

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
  