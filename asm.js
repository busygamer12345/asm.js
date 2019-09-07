/* eslint-disable no-with */
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
const STACK = []
var LOCALFS = false;
var LocalFileSystem = []
var GFS = false;

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
            ...files: assembely files to parse
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

/**
 * @class Implementation of Registers
 */
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

    /**
     * Returns value of selected register
     * @returns {number} value
     */
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
            //throw NullPtrError(this.memaddr + " address does not exist")
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
                if(label_name.startsWith(":")){
                    label_name = label_name.replace(":","")
                }
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
                parsed_lines.push({str:(`\nlabel("${label_name}",()=>{\n`+Parser.Parser2(parsed_label_commands)+`})\n`),parsed:true})
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
                        if(+tester===+tester){
                            split[token_num] = tester
                        }else{
                            //throw new SyntaxError("Illegal hexadecimal notation: "+split[token_num]) // ?HACK: Disable this for now, commands that end with h does not work
                            // TODO: Remember to implement ASCII Parser
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
            if(lex[0].includes(";")){
                continue
            }
            lex[0] = lex[0]+"("
            var comment = false

            var i=0;
            // eslint-disable-next-line no-constant-condition
            lex.push(")")
            i = 0
            for(i in lex){
                lex[i] = lex[i].replace("[","(")
                lex[i] = lex[i].replace("]",")")
                if(i!==0&&lex[0].includes("j")&&lex[i].startsWith(":")){
                    lex[i] = lex[i].replace(":","")
                    lex[i] = `"${lex[i]}"`
                }
            }
            var chunk = `${lex.join(",")}\n`


            if(/;/.test(chunk)){
                chunk = chunk.replace(";","/*")
                var unchunk = chunk.split("")
                if (unchunk[unchunk.length-1].includes(")")){
                    unchunk[unchunk.length-1]="*/"+unchunk[unchunk.length-1]
                }
                
                chunk = unchunk.join("")
                chunk = chunk.replace(/\)\*\//gmi,"*/)")
                chunk = chunk.replace(/\*\*/gmi,"")
            }

            evalstr+=chunk
        }
        //?console.log(evalstr)
        //evalstr = evalstr.replace(/\n/gmi,";")
        evalstr = evalstr.replace(/\(,/gmi,"(")
        evalstr = evalstr.replace(/,\)/gmi,")")
        evalstr = evalstr.replace(/"\./gmi,"\uFFFF\"")
        evalstr = evalstr.replace(/\)\*\//gmi,"*/)")
        evalstr = evalstr.replace(/\*\*/gmi,"")
        //!!!!!!!!!evalstr = evalstr.replace(/\)/gmi,"*/)")


        //?console.log(evalstr)
        return evalstr
    }

    static Parser(str){
        return(this.Parser2(this.Parser1(str)))
    }
}

class Stack{
    static Push(val){
        STACK.push(val)
        //? console.log(`stack: push: value: ${val}`)
    }
    static Pop(){
        if(STACK.length === 0){
            return 0xFFFF
        }else{
            var c = STACK.pop()
            //? console.log(`stack: pull: value: ${c}`)
            return c

        }
    }
}

// TODO: More optimisations will be useful: FileExtensionLimit
class FileSystemAPI{
    static InitalizeLocalFileSystem(){
        LocalFileSystem = this.DumpFileContent().toString().split("")
        LOCALFS = true;
    }
    static SaveLocalFileSystemToFile(){
        if(!LOCALFS){return}
        var buffer = Buffer(LocalFileSystem.join(""),"utf8")
        fs.writeFileSync("data.fs", buffer)
    }
    static WriteByteAtLocalFileSystem(location,byte){
        if(location > LocalFileSystem.length){
            if(GFS){
                var prevlength = LocalFileSystem.length-1;
                LocalFileSystem[location] = String.fromCharCode(byte)
                for(var i = prevlength ;i < LocalFileSystem.length; i++){
                    if(LocalFileSystem[i] === undefined){
                        LocalFileSystem[i] = "\u0000"
                    }
                }
                return
            }else{
                throw new Error("FileSystemError: Cannot set a byte out of bounds without initalizing GrowableFileSystemAPI!")
            }
        }
        LocalFileSystem[location] = String.fromCharCode(byte)
    }
    static ReadByteAtLocalFileSystem(location){
        if(LocalFileSystem[location] === undefined){
            return 0x0;
        }
        return LocalFileSystem[location].charCodeAt(0)
    }
    static InitalizeGrowableFileSystem(){
        if(!LOCALFS){throw new Error("FileSystemError: Cannot initalize GrowableFileSystem without inializing LocalFileSystem")}
        GFS = true;
    }
    static DumpFileContent(){
        return fs.readFileSync("data.fs")
    }
    static ReadByte(location){
        if(LOCALFS){return this.ReadByteAtLocalFileSystem(location)}
        var buff = fs.readFileSync("data.fs")
        //? console.log(`Read request: location: ${location}, value: ${buff[location].toString().charCodeAt(0)}`)
        return buff.toString().charCodeAt(location)
    }
    static WriteByte(location,byte){
        if(LOCALFS){this.WriteByteAtLocalFileSystem(location, byte); return}
        //? console.log(`data: ${byte}, location: ${location}`)
        var prevbuff = this.DumpFileContent()
        var theArray = prevbuff.toString().split("")
        theArray[location] = String.fromCharCode(byte)
        var theStr = theArray.join("")
        var theBuffAgain = Buffer(theStr,"utf8")
        //? if(prevbuff === theBuffAgain){console.log("no")}
        fs.writeFileSync("data.fs",theBuffAgain)
    }
    static InitalizeFile(){
        var buff = new Buffer(String.fromCharCode(0x0).repeat(0xFFFF),"utf8")
        fs.writeFileSync("data.fs", buff)
    }
    static IsFileInitalized(){
        var is = fs.existsSync("./data.fs")
        return is
    }
}

//var FileSystemAPI = Proxy()
function AllocateMemory(start=0x1,end=0xFFFF){
    if(!((typeof start === "number") || (typeof end === "number"))){
        //console.log(start+" "+end)
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
    //? console.log(dt)
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

function CompareAndReturn_eq(val1,val2){
    val1 = IntPtrAddrToInt(val1)
    val2 = IntPtrAddrToInt(val2)
    if(val1 === val2){
        RESULT = 1
    }else{
        RESULT = 0
    }
}

function CompareAndReturn_gt(val1,val2){
    val1 = IntPtrAddrToInt(val1)
    val2 = IntPtrAddrToInt(val2)
    if(val1 > val2){
        RESULT = 1
    }else{
        RESULT = 0
    }
}

function CompareAndReturn_lt(val1,val2){
    val1 = IntPtrAddrToInt(val1)
    val2 = IntPtrAddrToInt(val2)
    if(val1 < val2){
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

SystemCallReg.Add("filesystem",0x34,()=>{
    var eaxv = eax.getValue()
    var ebxv = ebx.getValue()
    var ecxv = ecx.getValue()

    switch(eaxv){
        case 0: (()=>{
            ax.setValue(FileSystemAPI.ReadByte(ebxv))
        })(); break
        case 1:(()=>{
            FileSystemAPI.WriteByte(ebxv, ecxv)
        })(); break
    }
})

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
            ans = ans.join("")
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


SystemCallReg.Add("tts",0x60,()=>{
    var eaxr = eax.getValue()
    var ebxr = ebx.getValue()

    switch (eaxr){
        case 0:(()=>{
            var wholeStr = ""
            for(var addr=ebxr;addr< 9000+ebxr;addr+=0x1){
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
            //console.log("ihihihugu")
            if(wholeStr.length>1000){
                // eslint-disable-next-line no-inner-declarations
                function chunkSubstr(str, size) {
                    const numChunks = Math.ceil(str.length / size)
                    const chunks = new Array(numChunks)
                  
                    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
                      chunks[i] = str.substr(o, size)
                    }
                  
                    return chunks
                }
                var chunks = chunkSubstr(wholeStr,100)
                for(var chunk of chunks){
                    execSync(`spd-say --voice=male3 --pitch=100 --volume=100 "${(chunk.replace("-","\\-")).replace("\n","")}"`)
                    sleep((chunk.length/18))
                }
            }else{
                execSync(`spd-say --voice=male3 --pitch=100 --volume=100 "${(wholeStr.replace("-","\\-")).replace("\n","")}"`)
                sleep((wholeStr.length/15)+1)
            }
        })();break;
        default:throw "exited"
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
var rax = new Register("rax")
var rbx = new Register("rbx")
var rcx = new Register("rcx")
var rdx = new Register("rdx")

ASSERT(typeof eax.getValue,"function")
ASSERT(eax.namel, "eax")
//ASSERT(eax.getValue(),0)
//! console.log(new Register("AX"))


//console.log(new Register("A"))

//console.log(global)
function mov(dt,val){
    val = IntPtrAddrToInt(val)
    //console.log(dt)
    MoveValToDT(dt,val)
}
function ptr(address){
    return new Pointer(address)
}
function alloc(s,e){
    s = IntPtrAddrToInt(s)
    e = IntPtrAddrToInt(e)
    //console.log(`start ${s} end ${e}`)
    AllocateMemory(s,e)
}
const add = function(dt,val){
    //console.log(dt)
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval+val)
}
let sub = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval-val)
}
let mul = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval*val)
}
let div = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval/val)
}
let and = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval&val)
}
let or = function(dt,val){
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval|val)
}
let xor = function(dt,val){
    //console.log(`dhiwhd ${dt}`)
    var dtval = IntPtrAddrToInt(dt)
    val = IntPtrAddrToInt(val)
    MoveValToDT(dt,dtval^val)
}
let not = function(dt){
    var dtval = IntPtrAddrToInt(dt)
   // var val = IntPtrAddrToInt(dt)
    MoveValToDT(dt,~dtval)
}
let inc = function(dt){
    var dtval = IntPtrAddrToInt(dt)
   // var val = IntPtrAddrToInt(dt)
    MoveValToDT(dt,dtval+1)
}
let dec = function(dt){
    var dtval = IntPtrAddrToInt(dt)
   // var val = IntPtrAddrToInt(dt)
    MoveValToDT(dt,dtval-1)
}
let zero = function(dt){
    //var dtval = IntPtrAddrToInt(dt)
   // var val = IntPtrAddrToInt(dt)
    MoveValToDT(dt,0)
}
function free(s,e){
    FreeMemory(s,e)
}
function db(s,str){
    s = IntPtrAddrToInt(s)
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
    CompareAndReturn_eq(val1,val2)
}
function cgt(val1,val2){
    CompareAndReturn_gt(val1,val2)
}
function clt(val1,val2){
    CompareAndReturn_lt(val1,val2)
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
let push = function(val){
    val = IntPtrAddrToInt(val)
    Stack.Push(val)
}
let pop = function(val){
    MoveValToDT(val,Stack.Pop())
}

let $res = function(val){
    MoveValToDT(val,RESULT)
}

if(!FileSystemAPI.IsFileInitalized()){FileSystemAPI.InitalizeFile()}
FileSystemAPI.InitalizeLocalFileSystem()
FileSystemAPI.InitalizeGrowableFileSystem()

process.on('SIGINT', function() {
    FileSystemAPI.SaveLocalFileSystemToFile()
    process.exit();
});

if(argv._.length !== 0){
    //console.log(argv._)
  //console.warn("Warning: Experimental feature! Leave before the bugs bite you!") // TODO: Remove this stupid line
  for(var file of argv._){
    if(!fs.existsSync(`./${file}`)){
        throw new String("Error in accessing file: "+file)
     }
     try{
        eval(Parser.Parser((fs.readFileSync(file).toString()))+"\n\n\n jmp('main')")
     }finally{
         FileSystemAPI.SaveLocalFileSystemToFile()
     }

  }
    
    process.exit()
}
////
////
////
if("repl" in argv ? argv["repl"] : false){
    console.log("Interactive REPL session")
    class exit
    {
        constructor ()
        {
            process.exit();
        }
        static toString () { return "call exit() or press Ctrl+C to exit"; }
    }
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
   //
}catch(e){
    if (PREFERNCES.SHOULD_TTS){
        execSync(`spd-say --voice=female2 --pitch=50 --volume=100 "${(String(e)).replace("\n","").replace("-","\\")}. Fatal error. Press enter to continue"`)
        read.question("Enter to continue")
    }
    throw e
}




//!----------------------------



//module.exports = {mov,ptr,alloc,add,free,db,int,Register,Pointer,MoveValToDT,IsStorage,IntPtrAddrToInt,IfNotStorageThrow,NullPtrError,UndefinedLabelError,RegistryError,Label,AllocateMemory,FreeMemory,JumpToInstruction,StoreInstruction,AX,BX,CX,DX,eax,ebx,ecx,EDX,RAX,RBX,RCX,RDX,FillMemoryWithBytes,SYSTEMCALLREG,SystemCallReg,SystemCall,MEMORY,LABEL}

