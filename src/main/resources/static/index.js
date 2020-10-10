const {log} = console;

Vue.component('md-viewer',{
    props: ['md'],
    computed: {
        html: function(){
            return marked(this.md);
        }
    },
    template:
`
<div v-html="html"></div>
`
});
Vue.component('md-editor',{
    data: function(){
        return {
            md: '',
        };
    },
    methods: {
        clickCancel: function () {
            this.$emit('click-cancel',this.md);
        },
        clickSave: function () {
            this.$emit('click-save',this.md);
        }
    },
    computed: {
        html: function (){
            return marked(this.md);

        }
    },
    template:
`
<div>
    <textarea v-model="md"></textarea>
    <button class="button-small" @click="clickSave">Save</button>
    <button class="button-small" @click="clickCancel">Cancel</button>
    <div v-html="html"></div>
</div>
`
})

const router = new VueRouter({ routes: [] });

// 调整marked图片渲染器
marked.Renderer.prototype.image = (href,title,text)=>{
    // log('渲染图片');
    if(!href.startsWith('http'))
    {
        // log('渲染到一张非网络图片');
        // log(href);
        // log(title);
        // log(text);
        let paths = [];
        for(let p of href.split(/[\/|\\]/)) if(p.length>=0) paths.push(p);
        let tempUrl = '/api/img/get?';
        for(let i=0;i<paths.length-1;i++)
        {
            let p = paths[i];
            tempUrl += 'paths='+p+'&';
        }
        tempUrl += 'file='+ paths[paths.length-1];
        href = tempUrl;
    }
    return `<img src="${href}" title="${title}" alt="${text}" style="max-width:100%">`;
}
marked.setOptions({
    highlight: (code)=>hljs.highlightAuto(code).value,
});

// todo 这个首页msg估计以后要换成动态从后台获取
const appIndexMd =
`
# Markdown 文档服务器

v0.4.0 by Firok

[项目GitHub地址](https://github.com/351768593/MarkdownServer)

`;

// 生成随机uuid
function uuid()
{
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
        .replace(/[xy]/g, (c)=>
        {
            const r = Math.random()*16|0;
            const v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
}

const app = new Vue({
    el: '#app',
    router: router,
    data: {
        dir: {
            paths: [],
            childrenDir: [],
            childrenFile: [],
        }, // 文件夹数据
        file: {
            paths: [],
            name: undefined,
            content: appIndexMd,
            changed: false,
            method: 'view',
        }, // 文件数据

        logs: [], // 屏幕日志列表

        windowMethod: 'both', // 文件树显示状态
    },
    methods: {
        clickParentDir: function() {
            let pathsNew = this.dir.paths.slice(0,this.dir.paths.length-1);
            this.pushPath(pathsNew,this.file.paths,this.file.name);
        },
        clickChildDir: function(path){
            if(path===undefined||path===null) return;
            let pathsNew = this.dir.paths.splice(0,this.dir.paths.length);
            pathsNew.push(path);
            this.pushPath(pathsNew,this.file.paths,this.file.name);
        },
        clickFile: function(file){
            this.pushPath(this.dir.paths,this.dir.paths,file);
        },


        clickCreateFile: function(){
            let name=window.prompt('请输入文件名');
            if(name!==null)
            {
                if(!name.endsWith('.md')||!name.endsWith('.MD'))
                {
                    name = name + '.md';
                }

                axios.post('/api/doc/write',{
                    paths: this.dir.paths,
                    file: name,
                    data: '> 创建于 '+new Date(),
                })
                .then((response)=>{
                    this.logMsg('信息','创建文件成功',true,2000);
                    this.flushDir(this.dir.paths);
                })
                .catch((error)=>{
                    this.logError('错误','创建文件失败:'+error,true,3500);
                });
            }
        },
        clickCreateDir: function(){
            const name=window.prompt('请输入文件夹名');
            if(name!==null)
            {
                let pathsTemp = [];
                for(let p of this.path.paths)
                {
                    pathsTemp.push(p);
                }
                pathsTemp.push(name);
                axios.post('/api/dir/create',{
                    paths: pathsTemp,
                })
                .then((response)=>{
                    this.logMsg('信息','创建文件夹成功',true,2000);
                    this.dir.paths = pathsTemp;
                    this.flushDir(pathsTemp);
                })
                .catch((error)=>{
                    this.logError('错误','创建文件夹失败:'+error,true,3500);
                });
            }
        },

        // 工具方法 - 键值选择
        choose: function(key,obj={}){
            return obj[key];
        },

        syncFile: function() // 同步当前文件内容到服务器
        {
            if(!this.file.changed) return; // 没有改动直接返回

            this.nPost(
                '/api/doc/write',
                {
                    paths: this.dir.paths,
                    file: this.file.name,
                    data: this.file.content,
                },
                (response)=>{
                    this.logMsg('信息','上传成功',true,2000);
                    this.file.changed = false;
                },
                (error)=>{
                    this.logError('错误','上传文件时发生错误:'+error,true,3500);Z
                }
            );
        },
        deleteFile: function() // 删除当前文件
        {
            if(this.file.name==undefined || this.file.name=='') return;

            const result = window.confirm('删除此文档?');
            if(!result) return;

            this.nPost(
                '/api/doc/delete',
                {
                    paths: this.file.paths,
                    file: this.file.name,
                },
                (response)=>{
                    this.logMsg('信息','删除成功',true,2000);
                    this.file.changed = false;
                    this.file.paths = [];
                    this.file.method = 'view';
                    this.file.name = '';
                    this.file.content = appIndexMd;
                    this.pushPath(this.dir.paths,this.file.paths,'');
                    this.flushPath();
                },
                (error)=>{
                    this.logError('错误','删除文件时发生错误:'+error,true,3500);
                }
            )
        },

        // 切换文件查看模式
        changeMethod: function(method='view')
        {
            this.file.method = method;
        },

        // 切换路径
        pushPath: function(pd=[],pf=[],file='')
        {
            // log('请求');
            // log(pd);
            // log(pf);
            // log(file);
            let query = {
                path: '',
                query: {
                    'pd': pd!=undefined && pd.length ? pd : undefined,
                    'pf': pf!=undefined && pf.length ? pf : undefined,
                    'f': file,
                },
            };
            this.$router.push(query);
        },

        // 仅根据路径更新目录内容
        flushDir: function(pd){
            // log('flush dir')
            // log(pd);

            // 刷新目录数据
            this.nPost(
                '/api/dir/list',
                { 'paths': pd, },
                (data)=>{
                    // log('data');
                    // log(data);
                    this.dir = data.data;
                    if(this.dir.paths==null) this.dir.paths=[];
                    if(this.dir.childrenDir==null) this.dir.childrenDir=[];
                    if(this.dir.childrenFile==null) this.dir.childrenFile=[];
                },
                (error)=>{
                    this.logError('错误','请求文件夹数据时发生错误:'+error,true,3500);
                }
            );
        },
        // 仅根据路径更新文件内容
        flushFile: function(pf,f){
            // log('flush file');
            // log(pf);
            // log(f);
            // 刷新文件数据

            // info 因为文件内容这个接口返回格式跟其它接口不一样 只能直接调用axios手动处理数据
            if(pf!=undefined && f!=undefined && f!='')
            {
                axios.get('/api/doc/file',{
                    params: {
                        paths: pf,
                        file: f,
                    },
                    paramsSerializer: params => {
                        return Qs.stringify(params, { indices: false })
                    },
                })
                .then((response)=>{

                    this.file.paths = pf;
                    this.file.name = f;
                    this.file.content = response.data;
                    this.file.changed = false;
                    // this.logMsg('信息','成功',true,2000);
                })
                .catch((error)=>{
                    this.logError('错误','请求文件数据时发生错误:'+error,true,3500);
                });
            }
        },

        // 自动根据当前的path数据更新所有界面数据
        flushPath: function ()
        {
            const path = this.path;
            this.flushDir(path.pd);
            this.flushFile(path.pf,path.f);
        },

        // 增加一条log信息
        logInner: function (title='信息', bodyHtml='', titleColor='#555555', closable=true, autoClose=-1)
        {
            const idNew = uuid();
            const logNew = {
                id: idNew,
                title: title,
                titleColor: titleColor,
                bodyHtml: bodyHtml,
                closable: closable,
                closer: autoClose? setTimeout(()=>{this.closeLogById(idNew)},autoClose) : undefined,
            };
            this.logs.push(logNew);
        },
        // 删除已经打开的log信息
        closeLogById: function(id)
        {
            for(let i=0;i<this.logs.length;i++)
            {
                if(this.logs[i].id === id)
                {
                    return this.logs.splice(i,1);
                }
            }
            return null;
        },

        // 增加一条错误log信息
        logError: function (title,msg,closable=true,autoClose=undefined) {
            this.logInner(title,msg,'#900',closable,autoClose);
        },
        // 增加一条提示log信息
        logMsg: function (title,msg,closable=true,autoClose=undefined) {
            this.logInner(title,msg,'#555',closable,autoClose);
        },

        // 网络请求封装方法 - get
        nGet: function(url,params=undefined,onSuccess=()=>{},onError=undefined)
        {
            axios.get(url,{
                'params': params,
                'paramsSerializer': pa => Qs.stringify(pa, { indices: false } ),
            })
                .then((response)=>{
                    const data = response.data;
                    if(data.success) onSuccess(data);
                    else throw data.msg;
                })
                .catch((error)=>{
                    if(onError) onError(error);
                    else this.logError('错误',error,true,3500);
                });
        },
        // 网络请求封装方法 - post
        nPost: function(url,params=undefined,onSuccess=()=>{},onError=undefined)
        {
            axios.post(url,params)
                .then((response)=>{
                    const data = response.data;
                    if(data.success) onSuccess(data);
                    else throw data.msg;
                })
                .catch((error)=>{
                    if(onError) onError(error);
                    else this.logError('错误',error,true,3500);
                });
        }
    },
    computed: {
        path: function()
        {
            let data = {
                pd: [],
                pf: [],
                f: null,
            };
            for(let p of ( this.$route.query.pd!= undefined? this.$route.query.pd : []))
                if(p!==null && p!==undefined && p!=='') data.pd.push(p);
            for(let p of ( this.$route.query.pf!= undefined? this.$route.query.pf : []))
                if(p!==null && p!==undefined && p!=='') data.pf.push(p);
            data.f = this.$route.query.f;
            return data;
        },

        viewMethod: function()
        {
            /*
            view - 查看模式
            both - 对照模式
            edit - 编辑模式
            * */
            return this.file.method;
        },
        htmlContent: function()
        {
            return marked(this.file.content);
        },

        styleFileTree: function()
        {
            switch (this.windowMethod) {

                case 'tree': return {
                    width: '100%',
                    height: '100%',
                    overflow: 'scroll',
                };
                case 'both': return {
                    width: '25%',
                    height: '100%',
                    overflow: 'scroll',
                };
                case 'file': return {
                    display: 'none',
                };
                default: return {};

            }
        },
        styleFileContent: function () {
            switch (this.windowMethod) {

                case 'tree': return {
                    display: 'none',
                };
                case 'both': return {
                    width: '75%',
                    display: 'flex',
                };
                case 'file': return {
                    width: '100%',
                    display: 'flex',
                };
                default: return {};

            }
        },

        styleFileContentEditor: function()
        {
            switch (this.viewMethod) {

                case 'edit': return {
                    width: '100%',
                    height: '100%',
                };
                case 'both': return {
                    width: '50%',
                    height: '100%',
                    display: 'inline',
                };
                case 'view': default: return {
                    display: 'none',
                };
            }
        },
        styleFileContentViewer: function()
        {
            switch (this.viewMethod) {

                case 'edit': return {
                    display: 'none',
                };
                case 'both': return {
                    width: '50%',
                    'max-height': '100%',
                    overflow: 'scroll',
                };
                case 'view': default: return {
                    width: '100%',
                    "max-height": '100%',
                    overflow: 'scroll',
                };
            }
        }
    },
});

// todo 以后可能要在路由切换之前先获取数据 成功之后再push进去 否则取消push事件
router.afterEach((t, f) => {
    t=t.query;
    f=f.query;

    if(t.pd==undefined) t.pd=[];
    if(f.pd==undefined) f.pd=[];
    if(t.pf==undefined) t.pf=[];
    if(f.pf==undefined) f.pf=[];
    if(t.f==undefined) t.f='';
    if(f.f==undefined) f.f='';

    let fileChanged = false, dirChanged = false;

    // 检查文件夹是否改变
    if(t.pd.length != f.pd.length) dirChanged = true;
    else
    {
        for(let i=0;i<t.pd.length;i++)
        {
            if(t.pd[i]!=f.pd[i])
            {
                dirChanged = true;
                break;
            }
        }
    }

    // 检查文件是否改变
    if(t.pf.length != f.pf.length || t.f!=f.f) fileChanged = true;
    else {
        for (let i = 0; i < t.pf.length; i++) {
            if (t.pf[i] != f.pf[i]) {
                fileChanged = true;
                break;
            }
        }
    }

    if(dirChanged) app.flushDir(t.pd);
    if(fileChanged) app.flushFile(t.pf,t.f);
})

if(typeof(app.$route.query.pd)==='string') app.$route.query.pd = [app.$route.query.pd];
if(typeof(app.$route.query.pf)==='string') app.$route.query.pf = [app.$route.query.pf];
app.flushPath();

