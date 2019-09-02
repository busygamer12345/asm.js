#!/usr/bin/node
/* eslint-disable no-unused-vars */
const read = require("readline-sync")
const fs = require("fs")
const Tokens = {
    Splitters:[" ",","],
    Keyword_LABEL_START:"@start",
    Keyword_LABEL_END:"@end",
    NEWLINE:"\n",
    STRING:"\""
}
var argv = require('minimist')(process.argv.slice(2));
const { execSync } = require('child_process');
/**
 * @description pauses main thread for {seconds}
 * @param {number} seconds 
 */
function sleep(seconds) 
{
  var e = new Date().getTime() + (seconds * 1000);
  // eslint-disable-next-line no-empty
  while (new Date().getTime() <= e) {}
}

const MEMORY = [0xFFFF,0x1,0xFFFF]
const LABEL = {}
const END = "\uFFFF"
var RESULT = 0

const PREFERNCES = {
    SHOULD_STDIN: true,
    SHOULD_STDOUT: true,
    SHOULD_CLS: true,
    IS_TTY: true,
    STD_PRESENT: true,
    SHOULD_TTS:false,
    FILE_MODE:false
}

if ("notty" in argv || "nostd" in argv || "N" in argv || argv._.includes("notty")){
    PREFERNCES.SHOULD_STDOUT = false
    PREFERNCES.SHOULD_STDIN = false
    PREFERNCES.SHOULD_CLS = false
    PREFERNCES.IS_TTY = false
    PREFERNCES.STD_PRESENT = false
}
else{
    if ("nostdin" in argv || "noinput" in argv){
        PREFERNCES.SHOULD_STDIN = false
    }

    if ("nostdout" in argv || "nooutput" in argv){
        PREFERNCES.SHOULD_STDOUT = false
    }

    if ("nocls" in argv || "noclear" in argv){
        PREFERNCES.SHOULD_CLS = false
    }

}

if ("handicap" in argv || "tts" in argv || "t" in argv){
    PREFERNCES.SHOULD_TTS = true
}

if("help" in argv || "h" in argv || "?" in argv || argv._.includes("/?") || argv._.includes("/help")){
    console.log(`
        ${process.argv[1]}: assembely processer
        Processes assembely js

        flags:
            --notty, --nostd: stops stdin, stdout and stdclear syscalls
            --nostdin, --noinput: stops stdin syscall
            --handicap, --tty, -t: duplicates stdout, stderr to stdtty
            --repl, -r: Starts interactive REPL session
            --file=filename: Reads asm from file
    `)
    process.exit()
}

if("file" in argv){
    PREFERNCES.FILE_MODE=true
}




function RegistryError(msg){
    return new String("RegistryError: "+msg)
}

function NullPtrError(msg){
    return new String("NullPointerException: "+msg)
}

function UndefinedLabelError(msg){
    return new String("UndefinedInstructionPointerException: "+msg)
}

class Register{
    constructor(name="eax",value=0){
        this.namel = name
        this.valuel = value
        return this
    }

    nameTest(){
        ASSERT(typeof this.namel,"string")
        ASSERT(typeof this.valuel, "number")
        var leak = eval(`${this.namel}`)
        //console.log(global["eax"])
        if(leak != undefined && leak != null){
            //if(global[this.name] instanceof Register){ // TODO: Should Fix this
                return true
            //}
        }

        return false
    }
    byteTest(val){
        if(typeof val === (typeof 1) || val instanceof Pointer){
            return true
        }
        return false
    }

    getValue(){
        if(!this.nameTest()){
            ASSERT(typeof this.namel,"string")
            throw RegistryError("register "+this.namel+" no longer exists")

        }
        ASSERT_NOT(eval(`${this.namel}`),undefined)
        return eval(`${this.namel}.valuel`)
    }

    setValue(val){
        if(!this.nameTest()){
            throw RegistryError("register "+this.namel+" no longer exists")
        }
        this.valuel = eval(`${this.namel}.valuel`)
        if(!this.byteTest(val)){
            throw RegistryError("value is not a byte")
        }

        if(val instanceof Pointer){
            eval(`${this.namel}.valuel = new Pointer(${val.memaddr})`)
            return
        }
        eval(`${this.namel}.valuel = ${val}`)
    }
}





class Pointer{
    constructor(mem){
        if(mem instanceof Register){
            mem = mem.getValue()
        }
        if(!(typeof mem === "number")){
            throw NullPtrError(mem.toString()+" is not a memory address")
        }
        

        this.memaddr = mem
    }
    _byteTest(val){
        if(typeof val === (typeof 1)){
            return true
        }
        if(val instanceof Pointer){
            return true
        }
        
        return false
    }
    _nullPtrTest(mem){
        if(MEMORY[mem] !== undefined && MEMORY[mem] !== null){
            return true
        }
        return false
    }
    getValue(){
        if(!this._nullPtrTest(this.memaddr)){
            throw NullPtrError("Attempt to perform action 'read' on memory address '"+this.memaddr + "' failed. Memory not initalized or memory was freed")
        }
        if(MEMORY[this.memaddr] instanceof Pointer){
            return MEMORY[this.memaddr].getValue()
        }
        return MEMORY[this.memaddr]
    }
    setValue(val){
        if(!this._nullPtrTest(this.memaddr)){
            throw NullPtrError(this.memaddr + " address does not exist")
        }
        if(!this._byteTest(val)){
            throw RegistryError("value is not a byte")
        }
        MEMORY[this.memaddr] = val
    }
}

class Label{
    static Set(label="",fun){
        LABEL[label] = fun
    }
    static Get(label){
        if(LABEL[label] === undefined || typeof LABEL[label] !== "function"){
            throw UndefinedLabelError(label+" is not defined or not a instruction")
        }
        return LABEL[label]
    }
}

class Parser{
    static Parser1(file=""){
        var lines = file.split(Tokens.NEWLINE)
        var in_label = false
        var label_name = ""
        var in_str = false
        var parsed_lines = []
        var parsed_label_commands = []

        for(var lc of lines){
            if(lc === ""){continue}
            lc = lc.trim()
            if(lc.includes(Tokens.Keyword_LABEL_START)){
                in_label = true
                label_name = lc.split(" ")[1]
                parsed_label_commands = []
                continue
            }
            if(lc.includes(Tokens.Keyword_LABEL_END)){
                if(!in_label){
                    throw new SyntaxError("unexpected end label statment")
                }
                if(label_name===""){
                    throw new SyntaxError("label name cannot be empty")
                }
                if(parsed_label_commands===[]){
                    throw new SyntaxError("label block cannot be empty")
                }
                if(!(typeof label_name === "string")){
                    throw new SyntaxError("Internal error")
                }
                in_label = false
                parsed_lines.push({str:(`label("${label_name}",()=>{`+Parser.Parser2(parsed_label_commands)+`});`),parsed:true})
                continue
            }

            lc = lc.replace(", ",",")
            lc = lc.replace(" ,",",")
            lc = lc.replace("  "," ")
            lc = lc.replace(" ",",")
            var split = lc.split(",")
            if(split.length === 0){
                continue
            }

            if(split.length === 1){
                throw new Error("LexerError: generic lexer error")
            }

            for(var num in split){
                split[num] = split[num].trim()
            }
            split[0] = split[0].toLowerCase()

            for(var token_num in split){
                if(+split[token_num] !== +split[token_num]){
                    
                    if(split[token_num].endsWith("h")){
                        var tester = `0x${split[token_num].replace("h","")}`
                        if(typeof +tester==="number"){
                            split[token_num] = tester
                        }else{
                            throw new SyntaxError("Illegal hexadecimal notation: "+split[token_num])
                        }
                    }else{
                        continue
                    }
                }
            }

            var the_obj = {arr:split,parsed:false}
            if(in_label){
                parsed_label_commands.push(the_obj)
            }else{
                parsed_lines.push(the_obj)
            }
        }
        return parsed_lines
    }

    static Parser2(the_lexresult=this.Parser1("")){
        var evalstr = ""
        for(var lex_obj of the_lexresult){
            if(lex_obj.parsed){
                evalstr+=lex_obj.str
                continue
            }
            var lex = lex_obj.arr
            lex[0] = lex[0]+"("
            lex.push(")")
            for(var i in lex){
                lex[i] = lex[i].replace("[","(")
                lex[i] = lex[i].replace("]",")")
            }
            evalstr+=`${lex.join(",")}\n`
        }
        console.log(evalstr)
        evalstr = evalstr.replace(/\n/gmi,";")
        evalstr = evalstr.replace(/\(,/gmi,"(")
        evalstr = evalstr.replace(/,\)/gmi,")")
        evalstr = evalstr.replace(/"\./gmi,"\uFFFF\"")

        console.log(evalstr)
        return evalstr
    }

    static Parser(str){
        return(this.Parser2(this.Parser1(str)))
    }
}



function AllocateMemory(start=0x1,end=0xFFFF){
    if(!((typeof start === "number") || (typeof end === "number"))){
        throw RegistryError("error in allocating memory. NaN")
    }else if(((start === Infinity) || (end === Infinity))){
        throw RegistryError("error in allocating memory. Out of bounds")
    }

    for(var add=start;add <= end; add += 0x1){
        if(MEMORY[add] === undefined || MEMORY[add] === null){
            // eslint-disable-next-line no-inner-declarations
            function getRandomInt(min, max) {
                min = Math.ceil(min);
                max = Math.floor(max);
                var result = Math.floor(Math.random() * (max - min + 1)) + min;
                if( result === 0x20 || result === 0xFFFF ){
                    return getRandomInt(min,max)
                }else{
                    return result
                }
            }
            var char = getRandomInt(0x1,0xFFFE)
            MEMORY[add] = char
        }
    }
}

function FreeMemory(start=0x1,end=0xFFFF){
    if(!((typeof start === "number") || (typeof end === "number"))){
        throw RegistryError("error in allocating memory. NaN")
    }else if(((start === Infinity) || (end === Infinity))){
        throw RegistryError("error in allocating memory. Out of bounds")
    }

    for(var addr=start;addr <= end; addr += 0x1){
         MEMORY[addr] = null
    }
}

function JumpToInstruction(label){
    (Label.Get(label))()
}

function StoreInstruction(label,fun){
    Label.Set(label,fun)
}

function IntPtrAddrToInt(any){
    if(typeof any === "number"){
        return any
    }
    else if (any instanceof Pointer || any instanceof Register){
        return any.getValue()
    }else{
        throw RegistryError("unknown data type")
    }
}

function IsStorage(dt){
    return (dt instanceof Pointer || dt instanceof Register)
}

function IfNotStorageThrow(dt){
    if(!IsStorage(dt)){
        throw RegistryError("data not writable")
    }
}

function IntPtrAddrToInt_noop(any){
    if(typeof any === "number"){
        return any
    }
    else if (any instanceof Register){
        return any.getValue()
    }else if(any instanceof Pointer){
        return any
    }
    
    else{
        throw "\n\n\u0FF8"
    }
}

function MoveValToDT(dt,val){
    IfNotStorageThrow(dt)
    if (dt instanceof Register){
        val = IntPtrAddrToInt(val) // !Pointers can reference pointers(no)
    }else{
        val = IntPtrAddrToInt(val) //* ...while Registers can't(yes and Pointers too)
    }

    dt.setValue(val)
}

function FillMemoryWithBytes(start,str="\uFFFF"){
    //console.log(str+" is the string")
    var id = 0
    for(var i = start; i < start+str.length;i+=0x1){
        AllocateMemory(i,i+0x1)
        var pt = new Pointer(i)
        pt.setValue(str[id].charCodeAt(0))
        id++
    }
}

function JumpIfTrue(ins){
    if (RESULT === 1){
        JumpToInstruction(ins)
    }
}

function JumpIfFalse(ins){
    if (RESULT === 0){
        JumpToInstruction(ins)
    }
}

function CompareAndReturn(val1,val2){
    val1 = IntPtrAddrToInt(val1)
    val2 = IntPtrAddrToInt(val2)
    if(val1 === val2){
        RESULT = 1
    }else{
        RESULT = 0
    }
}

function LoopTillRes(label){
    RESULT = 1
    for(;;){
        JumpIfTrue(label)
        if (RESULT === 0){
            break
        }
    }
}

function LoopUntilRes(label){
    RESULT = 0
    for(;;){
        JumpIfFalse(label)
        if (RESULT === 1){
            break
        }
    }
}


//console.log(new Register())

//exports = {Register,Pointer,MoveValToDT,IsStorage,IntPtrAddrToInt,IfNotStorageThrow,NullPtrError,UndefinedLabelError,RegistryError,Label,AllocateMemory,FreeMemory,JumpToInstruction,StoreInstruction,FillMemoryWithBytes,MEMORY,LABEL}


//const {Register,Pointer,MoveValToDT,IsStorage,IntPtrAddrToInt,IfNotStorageThrow,NullPtrError,UndefinedLabelError,RegistryError,Label,AllocateMemory,FreeMemory,JumpToInstruction,StoreInstruction,AX,BX,CX,DX,eax,ebx,ecx,EDX,RAX,RBX,RCX,RDX,FillMemoryWithBytes} = require("./asm-core")
const SYSTEMCALLREG = []

class SystemCall{
    constructor(hook=0x21,handler=()=>{}){
        this.hook = hook
        this.handler = handler
    }
    call(hook){
        if(hook === this.hook){
            this.handler()
        }
    }
}
class SystemCallReg{
    static Intercept(hook){
        for(var syscall of SYSTEMCALLREG){
            syscall.call(hook)
        }
    }
    static Add(_name="",hook=0x21,callback=()=>{}){
        SYSTEMCALLREG.push(new SystemCall(hook,callback))
    }
}

SystemCallReg.Add("program",0x21,()=>{
    var eaxr = eax.getValue()
    var ebxr = ebx.getValue()

    switch (eaxr){
        case 0:throw "exited"
        default:throw "exited"
    }
})

SystemCallReg.Add("stdio",0x10,()=>{
    var eaxr = eax.getValue()
    var ebxr = ebx.getValue() // for 0: start, for 1: len
    var ecxr = ecx.getValue() // for 1: memstart

    switch (eaxr){
        case 0:(()=>{ // 0-> stdout
            //////////// DEBUG: console.log(argv)
            if(PREFERNCES.SHOULD_TTS){
                var wholeStr = ""
                for(var addr=ebxr;;addr+=0x1){
                    if (addr > ebxr+0xFFFF){
                        return
                    }
                    AllocateMemory(addr,addr+0x1)
                    var char = (new Pointer(addr)).getValue()
                    if(char === 0xFFFF){
                        break
                    }
                    if(char === (",".charCodeAt(0)) && PREFERNCES.FILE_MODE){
                        char = 0x20
                    }
                    wholeStr += String.fromCharCode(char)
                }

                execSync(`spd-say --voice=male3 --pitch=100 --volume=100 "${(wholeStr.replace("-","\\-")).replace("\n","")}"`)
                sleep((wholeStr.length/15)+1)
            }
            if(!PREFERNCES.SHOULD_STDOUT){
                return
            }
            for(addr=ebxr;;addr+=0x1){
                if (addr > ebxr+0xFFFF){
                    return
                }
                AllocateMemory(addr,addr+0x1)
                char = (new Pointer(addr)).getValue()
                if(char === 0xFFFF){
                    return
                }
                if(char === (",".charCodeAt(0)) && PREFERNCES.FILE_MODE){
                    char = 0x20
                }
                process.stdout.write(String.fromCharCode(char))
            }
        
            
        })(); break;
        case 1:(()=>{ //1-> stdin
            if(!PREFERNCES.SHOULD_STDIN){
                AllocateMemory(ebxr.getValue(),ebxr.getValue()+1)
                MoveValToDT(new Pointer(ebxr),0xFFFF)
                return
            }
            var ans = read.question("")
            ans = ans.split("",ecxr)
            ans = ans.toString()
            ans.replace("\n","")
            FillMemoryWithBytes(ebxr,ans)
        })(); break;
        case 2:(()=>{ //2->ttyclear
            if(!PREFERNCES.SHOULD_CLS){
                return
            }
            var undef = console.clear()
        })();break;
        default:throw "unknown system call"
    }
})





//module.exports = {SYSTEMCALLREG,SystemCallReg,SystemCall}


//var core = require("./asm-core")
//var system = require("./asm-system")
var {ASSERT,ASSERT_NOT} = require("./asm-debug")
//console.log(global)
// 16 bit
ASSERT(1+1,2)
ASSERT_NOT(new Register(),undefined)

var ax = new Register("ax")
var bx = new Register("bx")
var cx = new Register("cx")
var dx = new Register("dx")

// 32 bit
var eax = new Register("eax")
var ebx = new Register("ebx")
var ecx = new Register("ecx")
var edx = new Register("edx")

// 64 bit
var rax = new Register("RAX")
var rbx = new Register("RBX")
var rcx = new Register("RCX")
var rdx = new Register("RDX")

ASSERT(typeof eax.getValue,"function")
ASSERT(eax.namel, "eax")
//ASSERT(eax.getValue(),0)
//! console.log(new Register("AX"))


//console.log(new Register("A"))

//console.log(global)
function mov(dt,val){
    MoveValToDT(dt,val)
}
function ptr(address){
    return new Pointer(address)
}
function alloc(s,e){
    s = IntPtrAddrToInt(s)
    e = IntPtrAddrToInt(e)
    AllocateMemory(s,e)
}
const add = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval+val)
}
function free(s,e){
    FreeMemory(s,e)
}
function db(s,str){
    FillMemoryWithBytes(s,str)
}
function int(hook){
    SystemCallReg.Intercept(hook)
}
function label(lt,fu){
    Label.Set(lt,fu)
}
function jmp(lt){
    JumpToInstruction(lt)
}

function cmp(val1,val2){
    CompareAndReturn(val1,val2)
}
function je(label){
    JumpIfTrue(label)
}
function jne(label){
    JumpIfFalse(label)
}
function jl(label){
    LoopTillRes(label)
}
function jle(label){
    LoopUntilRes(label)
}
let hook = function(label,syscall){
    SystemCallReg.Add("custom_hook",syscall,LABEL[label])
}


if("file" in argv){
    console.warn("Warning: Experimental feature! Leave before the bugs bite you!") // TODO: Remove this stupid line
    if(!fs.existsSync("./"+argv["file"])){
       throw new String("Error in accessing file: "+argv["file"])
    }
    eval(Parser.Parser((fs.readFileSync(argv["file"]).toString())))
    process.exit()
}
////
////
////
if("repl" in argv ? argv["repl"] : false){
    console.log("Interactive REPL session")
    var exit = function(){
        process.exit()
    }
    exit.toString = ()=>{return "call exit() or press Ctrl+C to exit"}
    var cls = function(){
        execSync("clear")
    }
    // eslint-disable-next-line no-constant-condition
    while(true){
        try{
        var res = eval(read.question(">>> "))
        if(res instanceof Register){
            console.log("Register<"+res.namel+"> "+res.valuel)
        }else if(typeof res === "object"){
            console.dir(res)
        }else{
            console.log(res)
        }

        }catch(e){
            console.trace(e)
            ////console.error(e)
        }
    }
}


//!------------------------------
//alloc(0x0,0xFFFFFF)
// section .data

// eslint-disable-next-line no-empty
try{
    db(0x1000,"Welcome to ButtOS\n"+END)
db(0x1100,"Booting BuTTOS...\n"+END)
db(0x1050,"Configuring Shell...\n"+END)
db(0x1200,"Shuting down BuTTOS...\n"+END)
db(0x1300,"MOTD: Increase your butt!!!\n"+END)
db(0x1400,"--- starting basic shell. help for commands, exit to shutdown ---\n"+END)
db(0x1500,"HELP: Commands are ECHO, BUTT, MOTD, RAND, LOTT, 0RUN, QUIT AND EXIT\n"+END)
db(0x1600,"BUTTSH:> "+END)
db(0x1700,"Your butt is: FAT!\n"+END)

db(0x10,"E")
db(0x11,"B")
db(0x12,"M")
db(0x13,"R")
db(0x14,"L")
db(0x15,"0")
db(0x16,"Q")
db(0x17,"X")

// section .boot

label("boot",()=>{
    mov(eax,0x2)
    int(0x10)
    mov(eax,0x0)
    mov(ebx,0x1100)
    int(0x10)
    alloc(0x0,0xFFFFFF)
    mov(ebx,0x1000)
    int(0x10)
    mov(ebx,0x1400)
    int(0x10)
})

// section .shell

label("shell",()=>{
    mov(eax,0x0)
    mov(ebx,0x1600)
    int(0x10)
    mov(eax,0x1)
    mov(ebx,0x100)
    mov(ecx,0xFFFF)
    int(0x10)
    mov(rax,0x10)
    jmp("parse")
    cmp(rax,0x0)
    je("cmd_echo")
    cmp(rax,0x1)
    je("cmd_butt")
    cmp(rax,0x2)
    je("cmd_motd")
    cmp(rax,0x3)
    je("cmd_echo")
    cmp(rax,0x4)
    je("cmd_echo")
    cmp(rax,0x5)
    je("cmd_echo")
    cmp(rax,0x6)
    je("cmd_quit")
    cmp(rax,0x7)
    je("cmd_exit")

    cmp(0x0,0x1)
})


label("cmd_exit",()=>{
    mov(eax,0x0)
    mov(ebx,0x1200)
    int(0x10)
    free(0x0,0xFFFFFF)
    mov(eax,0x2)
    int(0x10)
    int(0x21)
})

label("cmd_quit",()=>{
    alloc(0x0,0xFFFFFFFFFF)
})

label("cmd_motd",()=>{
    mov(eax,0x0)
    mov(ebx,0x1300)
    int(0x10)
})

label("cmd_butt",()=>{
    mov(eax,0x0)
    mov(ebx,0x1700)
    int(0x10)
})

label("setecho",()=>{
    mov(rax,0x0)
})

label("setbutt",()=>{
    mov(rax,0x1)
})

label("setmotd",()=>{
    mov(rax,0x2)
})

label("setrand",()=>{
    mov(rax,0x3)
})

label("setlott",()=>{
    mov(rax,0x4)
})

label("set0run",()=>{
    mov(rax,0x5)
})

label("setquit",()=>{
    mov(rax,0x6)
})

label("setexit",()=>{
    mov(rax,0x7)
})

label("checkE",()=>{
    cmp(ptr(0x101),ptr(0x17))
    je("setexit")
    jne("setecho")
})

label("parse",()=>{
    cmp(ptr(0x100),ptr(0x10))
    je("checkE")
    cmp(ptr(0x100),ptr(0x11))
    je("setbutt")
    cmp(ptr(0x100),ptr(0x12))
    je("setmotd")
    cmp(ptr(0x100),ptr(0x13))
    je("setrand")
    cmp(ptr(0x100),ptr(0x14))
    je("setlott")
    cmp(ptr(0x100),ptr(0x15))
    je("set0run")
    cmp(ptr(0x100),ptr(0x16))
    je("setquit")
})

// section .main

jmp("boot")
jle("shell")
}catch(e){
    if (PREFERNCES.SHOULD_TTS){
        execSync(`spd-say --voice=female2 --pitch=50 --volume=100 "${(String(e)).replace("\n","").replace("-","\\")}. Fatal error. Press enter to continue"`)
        read.question("Enter to continue")
    }
    throw e
}




//!----------------------------



//module.exports = {mov,ptr,alloc,add,free,db,int,Register,Pointer,MoveValToDT,IsStorage,IntPtrAddrToInt,IfNotStorageThrow,NullPtrError,UndefinedLabelError,RegistryError,Label,AllocateMemory,FreeMemory,JumpToInstruction,StoreInstruction,AX,BX,CX,DX,eax,ebx,ecx,EDX,RAX,RBX,RCX,RDX,FillMemoryWithBytes,SYSTEMCALLREG,SystemCallReg,SystemCall,MEMORY,LABEL}

