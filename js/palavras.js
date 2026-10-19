// Banco de senhas do Palavra-Chave, em três níveis de dificuldade.
// Para acrescentar palavras, basta incluir no texto do nível (separadas por espaço ou quebra de linha).

const FACIL = `
casa carro cachorro gato bola sol lua praia mar escola livro mesa cadeira cama janela porta
telefone celular televisão geladeira fogão banana maçã laranja uva morango abacaxi melancia
pão leite café arroz feijão bolo pizza sorvete chocolate queijo ovo frango peixe árvore flor
chuva neve vento nuvem estrela avião navio barco trem ônibus bicicleta moto caminhão médico
professor bombeiro policial cozinheiro futebol piscina sapato meia camisa chapéu óculos relógio
anel colar mochila caneta lápis borracha caderno tesoura cola papel música violão piano bateria
cantor dança festa aniversário presente vela balão palhaço circo leão tigre elefante girafa
macaco zebra urso coelho cavalo vaca porco galinha pato sapo cobra jacaré tartaruga borboleta
abelha formiga aranha mosquito baleia tubarão golfinho polvo pinguim coruja papagaio pássaro
ovelha cabra rato dinossauro minhoca caracol joaninha mamão limão manga pera coco goiaba
cenoura batata tomate cebola alho alface milho pipoca biscoito bala pirulito suco água
refrigerante sopa macarrão salada hambúrguer sanduíche manteiga mel açúcar sal pimenta
garfo faca colher prato copo xícara panela chaleira toalha sabonete escova pente espelho
banheiro cozinha quarto sala jardim telhado parede chão escada elevador garagem quintal
cidade rua estrada ponte rio lago montanha floresta ilha deserto campo fazenda sítio
hospital farmácia padaria mercado igreja parque zoológico aeroporto rodoviária shopping
dentista enfermeiro pintor carteiro motorista piloto marinheiro soldado juiz advogado
mãe pai avó avô irmão tio primo bebê criança família amigo vizinho noivo rei rainha
princesa príncipe fada bruxa fantasma monstro pirata robô super-herói mágico
olho nariz boca orelha cabelo mão pé braço perna dente língua coração barriga joelho
dedo unha costas pescoço bigode barba sorriso lágrima beijo abraço
vermelho azul verde amarelo preto branco rosa roxo cinza marrom
segunda domingo sábado janeiro dezembro natal páscoa carnaval férias verão inverno
manhã noite dia semana hora minuto ano
brinquedo boneca carrinho pipa peão bolinha quebra-cabeça videogame dado baralho
apito tambor sino corneta guitarra flauta microfone rádio fone computador teclado
mouse impressora câmera foto filme desenho tinta pincel giz quadro
lanterna vassoura balde regador mangueira martelo prego parafuso serrote chave cadeado
guarda-chuva casaco luva cachecol bota chinelo sandália tênis vestido saia calça bermuda
pijama gravata cinto bolsa carteira dinheiro moeda nota cofre
sorveteria pizzaria lanchonete restaurante cinema teatro museu biblioteca
futebol vôlei basquete natação corrida tênis golfe xadrez dama boxe judô surfe skate patins
gol juiz apito trave medalha troféu campeão torcida estádio uniforme
foguete planeta astronauta lua satélite cometa terra fogo gelo pedra areia terra lama
folha galho raiz semente fruta grama cacto rosa girassol margarida
travesseiro cobertor lençol colchão sofá tapete cortina abajur lâmpada tomada
geladeira microondas liquidificador ventilador ar-condicionado aspirador ferro máquina
envelope carta selo correio pacote caixa sacola etiqueta fita barbante
nariz espirro tosse febre gripe remédio vacina curativo injeção termômetro
bombom brigadeiro pudim gelatina pastel coxinha empada esfiha tapioca cuscuz pamonha
churrasco feijoada lasanha panqueca omelete torrada iogurte cereal granola
avental chef garçom cardápio conta gorjeta mesa toalha guardanapo
cachoeira onda concha estrela-do-mar caranguejo areia guarda-sol prancha boia
barraca fogueira mochila lanterna mapa bússola trilha acampamento
trator enxada galinheiro curral celeiro espantalho colheita
ambulância viatura sirene semáforo faixa calçada esquina placa
`;

const MEDIO = `
aeroporto hospital supermercado biblioteca museu castelo vampiro dragão sereia unicórnio
astronauta vulcão cachoeira farol túnel calendário casamento viagem mala passaporte banco
segredo mentira verdade sonho pesadelo saudade ciúme preguiça coragem medo alegria tristeza
raiva vergonha orgulho paciência sorte azar esperança amizade namoro paixão
eleição presidente prefeito deputado governo imposto multa salário emprego chefe reunião
entrevista currículo aposentadoria férias feriado folga greve
escritório fábrica oficina laboratório consultório cartório delegacia prefeitura tribunal
cadeia prisão ladrão detetive espião herói vilão bandido assalto
cientista inventor arquiteto engenheiro jornalista fotógrafo escritor poeta ator diretor
mecânico eletricista encanador pedreiro marceneiro costureira cabeleireiro manicure
veterinário psicólogo farmacêutico nutricionista fisioterapeuta
internet senha computador aplicativo mensagem vídeo foto selfie curtida seguidor
notícia jornal revista novela desenho filme série capítulo episódio final
orquestra maestro sinfonia show plateia palco aplauso ingresso fila bilheteria
olimpíada copa mundial campeonato maratona pódio árbitro pênalti escanteio impedimento
goleiro atacante zagueiro torcedor hino bandeira mascote
pirâmide múmia faraó gladiador cavaleiro armadura espada escudo flecha arco canhão
tesouro mapa ilha caverna labirinto enigma charada mistério pista suspeito
relâmpago trovão tempestade furacão terremoto enchente seca arco-íris neblina geada
termômetro barômetro microscópio telescópio lupa ímã bússola balança régua
dinossauro fóssil esqueleto caveira osso músculo sangue veia cérebro pulmão
estômago fígado rim garganta ombro cotovelo tornozelo calcanhar umbigo sobrancelha
cílios pestana bochecha queixo testa
casamento noiva aliança buquê bolo convite padrinho lua-de-mel divórcio
batizado formatura diploma vestibular prova nota recreio uniforme diretor
matemática português história geografia ciências química física biologia
dicionário enciclopédia gramática alfabeto vogal poesia rima conto fábula lenda
saci curupira iara mula-sem-cabeça boitatá lobisomem
carnaval fantasia máscara confete serpentina samba escola-de-samba bloco trio
festa-junina quadrilha fogueira quentão pipoca pinhão pescaria correio-elegante
reveillon fogos champanhe contagem promessa
geladeira freezer congelador forno churrasqueira lareira chaminé varanda sacada porão sótão
condomínio portaria porteiro síndico mudança aluguel inquilino corretor
hotel pousada resort cruzeiro excursão guia turista souvenir mapa roteiro bagagem
alfândega fronteira embaixada visto câmbio dólar euro real
ouro prata bronze diamante esmeralda rubi pérola cristal joia relíquia
perfume batom maquiagem esmalte rímel brinco pulseira tiara coroa
pirulito algodão-doce maçã-do-amor churros paçoca pé-de-moleque cocada quindim
caipirinha cerveja vinho whisky cachaça chope
sushi temaki yakisoba lámen taco burrito croissant fondue paella risoto
ketchup mostarda maionese azeite vinagre orégano canela cravo baunilha
academia musculação esteira halteres alongamento ioga pilates dieta caloria vitamina
aquário viveiro gaiola coleira ração focinheira pulga carrapato
camaleão lagartixa morcego vagalume gafanhoto grilo cigarra libélula besouro escorpião
águia falcão gavião urubu pavão flamingo tucano beija-flor cegonha pelicano
canguru coala panda hipopótamo rinoceronte camelo lhama alce bisão gorila
esquilo castor ouriço tamanduá preguiça tatu capivara onça lobo raposa
salmão sardinha atum bacalhau lagosta camarão ostra lula medusa cavalo-marinho
abacate kiwi framboesa amora cereja ameixa pêssego figo caju pitanga jabuticaba açaí
berinjela abobrinha pepino pimentão brócolis couve espinafre beterraba mandioca inhame
amendoim castanha nozes avelã pistache gergelim
trânsito engarrafamento pedágio rodízio radar multa estacionamento posto gasolina pneu
volante buzina freio retrovisor cinto airbag motor marcha embreagem
metrô bonde teleférico helicóptero balão submarino jangada canoa caiaque iate
fotografia pintura escultura grafite mosaico retrato paisagem galeria exposição
quebra-cabeça dominó bingo loteria roleta cassino aposta sorteio rifa
mágica truque coelho cartola varinha ilusionista hipnotizador
príncipe castelo dragão espada cavaleiro torre ponte-levadiça masmorra trono
ninja samurai cowboy xerife índio viking pirata corsário
fantasma assombração cemitério caixão vela abóbora halloween
presépio árvore-de-natal papai-noel rena trenó meia ceia peru panetone
coelho-da-páscoa ovo-de-páscoa colomba
oração promessa milagre anjo demônio paraíso inferno
tatuagem piercing cicatriz espinha sarda verruga ruga careca peruca
bengala muleta cadeira-de-rodas maca soro raio-x cirurgia anestesia plantão
conselho fofoca boato piada pegadinha trote apelido sobrenome assinatura
`;

const DIFICIL = `
democracia burocracia nostalgia paradoxo eclipse horóscopo metamorfose hipnose miragem
inflação economia orçamento investimento herança testamento cartório procuração
filosofia psicologia sociologia antropologia arqueologia astronomia astrologia
gravidade atmosfera oxigênio hidrogênio átomo molécula célula bactéria vírus fungo
evolução genética clone mutação fotossíntese ecossistema reciclagem poluição desmatamento
aquecimento sustentabilidade energia eletricidade magnetismo radiação
hierarquia monarquia república ditadura revolução independência abolição colônia império
constituição parlamento senado ministro embaixador diplomacia tratado aliança
censura propaganda campanha pesquisa estatística porcentagem média recorde
algoritmo programação robótica inteligência criptografia vírus hacker servidor nuvem
metáfora ironia sarcasmo trocadilho provérbio ditado anedota crônica biografia
saudade melancolia euforia ansiedade empatia egoísmo vaidade inveja gratidão generosidade
honestidade lealdade traição vingança perdão castigo recompensa sacrifício
liberdade justiça igualdade privilégio preconceito tolerância respeito disciplina
ambição curiosidade criatividade inspiração intuição memória imaginação consciência
coincidência destino acaso karma superstição premonição déjà-vu
amnésia insônia sonambulismo soluço bocejo cócegas arrepio calafrio tontura enjoo
alergia vacina epidemia quarentena sintoma diagnóstico receita placebo
hemisfério equador trópico latitude longitude fuso meridiano bússola continente
arquipélago península istmo planalto planície cordilheira geleira iceberg oásis savana
pantanal cerrado caatinga manguezal restinga
anfiteatro coliseu catedral mosteiro convento basílica capela santuário
renascimento barroco gótico modernismo surrealismo cubismo impressionismo
ópera balé sinfonia sonata serenata maestro solista dueto coral acústica
legenda dublagem roteiro cenário figurino bastidor estreia bilheteria crítica
patrocínio franquia monopólio concorrência falência sociedade acionista dividendo
contrato cláusula fiança juros hipoteca financiamento parcela crediário
adolescência infância velhice maturidade puberdade gestação maternidade adoção
casamento noivado lua-de-mel bodas viuvez divórcio pensão
arquivo protocolo carimbo requerimento certidão alvará licença matrícula
microscópio estetoscópio bisturi seringa marca-passo prótese transplante
labirinto quebra-cabeça charada enigma código cifra senha segredo
camuflagem disfarce emboscada armadilha sabotagem chantagem suborno
naufrágio tsunami avalanche erupção tornado ciclone granizo garoa orvalho
constelação galáxia nebulosa supernova buraco-negro meteoro asteroide órbita
gravata-borboleta suspensório colete smoking fraque
dicionário vocabulário pronúncia sotaque gíria dialeto idioma tradução
perspectiva horizonte silhueta sombra reflexo eco vácuo
paciência teimosia ingenuidade malandragem jeitinho gambiarra
sedentarismo maratona triatlo decatlo esgrima hipismo remo canoagem
xadrez xeque-mate estratégia tática blefe trunfo coringa
pleonasmo onomatopeia palíndromo anagrama acróstico trava-língua
fotografia holograma realidade-virtual videoconferência transmissão
cerimônia protocolo etiqueta elegância gentileza cortesia
mordomo governanta chofer jardineiro babá faxineira
alquimia feitiço poção amuleto talismã profecia oráculo
utopia apocalipse catástrofe milagre fenômeno lenda mito folclore
ventríloquo malabarista equilibrista trapezista domador acrobata
`;

function lista(texto) {
  return texto.split(/\s+/).map(p => p.trim()).filter(Boolean);
}

// Uma palavra fica só no primeiro nível em que aparece, sem repetições.
function montarBanco() {
  const vistas = new Set();
  const banco = {};
  for (const [nivel, texto] of [["facil", FACIL], ["medio", MEDIO], ["dificil", DIFICIL]]) {
    banco[nivel] = lista(texto).filter(p => {
      const chave = p.toLowerCase();
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    });
  }
  return banco;
}

export const BANCO = montarBanco();
