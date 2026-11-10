import{a as Ve,f as b,G as Le,w as P,c as u,y as At,M as R,T as C,e as ie,p as Y,z as Pt,B as ae,F as U,H as Oe,J as Ut,j as $,K as _e,L as We,N as $e,O as je,Q as Ne,d as K,C as te,D as oe,h as H,R as V,W as Gt,P as It,b as be,X as ve,E as Dt,k as re,t as Et,Y as zt,Z as Ft,v as Ht}from"./pixi-board-DzV1pEOi.js";import{i as Vt,f as Lt,a as ye,b as W,G as Ye,j as Ke,U as le,e as Ot,F as Wt,S as $t,R as Q,B as jt,C as Se}from"./CanvasPool-Ckd2XZT6.js";class Te{constructor(e){typeof e=="number"?this.rawBinaryData=new ArrayBuffer(e):e instanceof Uint8Array?this.rawBinaryData=e.buffer:this.rawBinaryData=e,this.uint32View=new Uint32Array(this.rawBinaryData),this.float32View=new Float32Array(this.rawBinaryData),this.size=this.rawBinaryData.byteLength}get int8View(){return this._int8View||(this._int8View=new Int8Array(this.rawBinaryData)),this._int8View}get uint8View(){return this._uint8View||(this._uint8View=new Uint8Array(this.rawBinaryData)),this._uint8View}get int16View(){return this._int16View||(this._int16View=new Int16Array(this.rawBinaryData)),this._int16View}get int32View(){return this._int32View||(this._int32View=new Int32Array(this.rawBinaryData)),this._int32View}get float64View(){return this._float64Array||(this._float64Array=new Float64Array(this.rawBinaryData)),this._float64Array}get bigUint64View(){return this._bigUint64Array||(this._bigUint64Array=new BigUint64Array(this.rawBinaryData)),this._bigUint64Array}view(e){return this[`${e}View`]}destroy(){this.rawBinaryData=null,this.uint32View=null,this.float32View=null,this.uint16View=null,this._int8View=null,this._uint8View=null,this._int16View=null,this._int32View=null,this._float64Array=null,this._bigUint64Array=null}static sizeOf(e){switch(e){case"int8":case"uint8":return 1;case"int16":case"uint16":return 2;case"int32":case"uint32":case"float32":return 4;default:throw new Error(`${e} isn't a valid view type`)}}}function Ce(n,e,t,r){if(t??(t=0),r??(r=Math.min(n.byteLength-t,e.byteLength)),!(t&7)&&!(r&7)){const s=r/8;new Float64Array(e,0,s).set(new Float64Array(n,t,s))}else if(!(t&3)&&!(r&3)){const s=r/4;new Float32Array(e,0,s).set(new Float32Array(n,t,s))}else new Uint8Array(e).set(new Uint8Array(n,t,r))}const Nt={normal:"normal-npm",add:"add-npm",screen:"screen-npm"};var k=(n=>(n[n.DISABLED=0]="DISABLED",n[n.RENDERING_MASK_ADD=1]="RENDERING_MASK_ADD",n[n.MASK_ACTIVE=2]="MASK_ACTIVE",n[n.INVERSE_MASK_ACTIVE=3]="INVERSE_MASK_ACTIVE",n[n.RENDERING_MASK_REMOVE=4]="RENDERING_MASK_REMOVE",n[n.NONE=5]="NONE",n))(k||{});function ke(n,e){return e.alphaMode==="no-premultiply-alpha"&&Nt[n]||n}const Yt=["precision mediump float;","void main(void){","float test = 0.1;","%forloop%","gl_FragColor = vec4(0.0);","}"].join(`
`);function Kt(n){let e="";for(let t=0;t<n;++t)t>0&&(e+=`
else `),t<n-1&&(e+=`if(test == ${t}.0){}`);return e}function qt(n,e){if(n===0)throw new Error("Invalid value of `0` passed to `checkMaxIfStatementsInShader`");const t=e.createShader(e.FRAGMENT_SHADER);try{for(;;){const r=Yt.replace(/%forloop%/gi,Kt(n));if(e.shaderSource(t,r),e.compileShader(t),!e.getShaderParameter(t,e.COMPILE_STATUS))n=n/2|0;else break}}finally{e.deleteShader(t)}return n}let D=null;function Qt(){var e;if(D)return D;const n=Vt();return D=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),D=qt(D,n),(e=n.getExtension("WEBGL_lose_context"))==null||e.loseContext(),D}class Xt{constructor(){this.ids=Object.create(null),this.textures=[],this.count=0}clear(){for(let e=0;e<this.count;e++){const t=this.textures[e];this.textures[e]=null,this.ids[t.uid]=null}this.count=0}}class Jt{constructor(){this.renderPipeId="batch",this.action="startBatch",this.start=0,this.size=0,this.textures=new Xt,this.blendMode="normal",this.topology="triangle-strip",this.canBundle=!0}destroy(){this.textures=null,this.gpuBindGroup=null,this.bindGroup=null,this.batcher=null,this.elements=null}}const L=[];let q=0;Le.register({clear:()=>{if(L.length>0)for(const n of L)n&&n.destroy();L.length=0,q=0}});function we(){return q>0?L[--q]:new Jt}function Re(n){n.elements=null,L[q++]=n}let z=0;const qe=class Qe{constructor(e){this.uid=Ve("batcher"),this.dirty=!0,this.batchIndex=0,this.batches=[],this._elements=[],e={...Qe.defaultOptions,...e},e.maxTextures||(b("v8.8.0","maxTextures is a required option for Batcher now, please pass it in the options"),e.maxTextures=Qt());const{maxTextures:t,attributesInitialSize:r,indicesInitialSize:s}=e;this.attributeBuffer=new Te(r*4),this.indexBuffer=new Uint16Array(s),this.maxTextures=t}begin(){this.elementSize=0,this.elementStart=0,this.indexSize=0,this.attributeSize=0;for(let e=0;e<this.batchIndex;e++)Re(this.batches[e]);this.batchIndex=0,this._batchIndexStart=0,this._batchIndexSize=0,this.dirty=!0}add(e){this._elements[this.elementSize++]=e,e._indexStart=this.indexSize,e._attributeStart=this.attributeSize,e._batcher=this,this.indexSize+=e.indexSize,this.attributeSize+=e.attributeSize*this.vertexSize}checkAndUpdateTexture(e,t){const r=e._batch.textures.ids[t._source.uid];return!r&&r!==0?!1:(e._textureId=r,e.texture=t,!0)}updateElement(e){this.dirty=!0;const t=this.attributeBuffer;e.packAsQuad?this.packQuadAttributes(e,t.float32View,t.uint32View,e._attributeStart,e._textureId):this.packAttributes(e,t.float32View,t.uint32View,e._attributeStart,e._textureId)}break(e){const t=this._elements;if(!t[this.elementStart])return;let r=we(),s=r.textures;s.clear();const i=t[this.elementStart];let a=ke(i.blendMode,i.texture._source),o=i.topology;this.attributeSize*4>this.attributeBuffer.size&&this._resizeAttributeBuffer(this.attributeSize*4),this.indexSize>this.indexBuffer.length&&this._resizeIndexBuffer(this.indexSize);const l=this.attributeBuffer.float32View,h=this.attributeBuffer.uint32View,c=this.indexBuffer;let f=this._batchIndexSize,m=this._batchIndexStart,p="startBatch",g=[];const S=this.maxTextures;for(let _=this.elementStart;_<this.elementSize;++_){const d=t[_];t[_]=null;const x=d.texture._source,v=ke(d.blendMode,x),y=a!==v||o!==d.topology;if(x._batchTick===z&&!y){d._textureId=x._textureBindLocation,f+=d.indexSize,d.packAsQuad?(this.packQuadAttributes(d,l,h,d._attributeStart,d._textureId),this.packQuadIndex(c,d._indexStart,d._attributeStart/this.vertexSize)):(this.packAttributes(d,l,h,d._attributeStart,d._textureId),this.packIndex(d,c,d._indexStart,d._attributeStart/this.vertexSize)),d._batch=r,g.push(d);continue}x._batchTick=z,(s.count>=S||y)&&(this._finishBatch(r,m,f-m,s,a,o,e,p,g),p="renderBatch",m=f,a=v,o=d.topology,r=we(),s=r.textures,s.clear(),g=[],++z),d._textureId=x._textureBindLocation=s.count,s.ids[x.uid]=s.count,s.textures[s.count++]=x,d._batch=r,g.push(d),f+=d.indexSize,d.packAsQuad?(this.packQuadAttributes(d,l,h,d._attributeStart,d._textureId),this.packQuadIndex(c,d._indexStart,d._attributeStart/this.vertexSize)):(this.packAttributes(d,l,h,d._attributeStart,d._textureId),this.packIndex(d,c,d._indexStart,d._attributeStart/this.vertexSize))}s.count>0&&(this._finishBatch(r,m,f-m,s,a,o,e,p,g),m=f,++z),this.elementStart=this.elementSize,this._batchIndexStart=m,this._batchIndexSize=f}_finishBatch(e,t,r,s,i,a,o,l,h){e.gpuBindGroup=null,e.bindGroup=null,e.action=l,e.batcher=this,e.textures=s,e.blendMode=i,e.topology=a,e.start=t,e.size=r,e.elements=h,++z,this.batches[this.batchIndex++]=e,o.add(e)}finish(e){this.break(e)}ensureAttributeBuffer(e){e*4<=this.attributeBuffer.size||this._resizeAttributeBuffer(e*4)}ensureIndexBuffer(e){e<=this.indexBuffer.length||this._resizeIndexBuffer(e)}_resizeAttributeBuffer(e){const t=Math.max(e,this.attributeBuffer.size*2),r=new Te(t);Ce(this.attributeBuffer.rawBinaryData,r.rawBinaryData),this.attributeBuffer=r}_resizeIndexBuffer(e){const t=this.indexBuffer;let r=Math.max(e,t.length*1.5);r+=r%2;const s=r>65535?new Uint32Array(r):new Uint16Array(r);if(s.BYTES_PER_ELEMENT!==t.BYTES_PER_ELEMENT)for(let i=0;i<t.length;i++)s[i]=t[i];else Ce(t.buffer,s.buffer);this.indexBuffer=s}packQuadIndex(e,t,r){e[t]=r+0,e[t+1]=r+1,e[t+2]=r+2,e[t+3]=r+0,e[t+4]=r+2,e[t+5]=r+3}packIndex(e,t,r,s){const i=e.indices,a=e.indexSize,o=e.indexOffset,l=e.attributeOffset;for(let h=0;h<a;h++)t[r++]=s+i[h+o]-l}destroy(e={}){var t;if(this.batches!==null){for(let r=0;r<this.batchIndex;r++)Re(this.batches[r]);this.batches=null,this.geometry.destroy(!0),this.geometry=null,e.shader&&((t=this.shader)==null||t.destroy(),this.shader=null);for(let r=0;r<this._elements.length;r++)this._elements[r]&&(this._elements[r]._batch=null);this._elements=null,this.indexBuffer=null,this.attributeBuffer.destroy(),this.attributeBuffer=null}}};qe.defaultOptions={maxTextures:null,attributesInitialSize:4,indicesInitialSize:6};let Zt=qe;const er=new Float32Array(1),tr=new Uint32Array(1);class rr extends Lt{constructor(){const t=new ye({data:er,label:"attribute-batch-buffer",usage:W.VERTEX|W.COPY_DST,shrinkToFit:!1}),r=new ye({data:tr,label:"index-batch-buffer",usage:W.INDEX|W.COPY_DST,shrinkToFit:!1}),s=24;super({attributes:{aPosition:{buffer:t,format:"float32x2",stride:s,offset:0},aUV:{buffer:t,format:"float32x2",stride:s,offset:8},aColor:{buffer:t,format:"unorm8x4",stride:s,offset:16},aTextureIdAndRound:{buffer:t,format:"uint16x2",stride:s,offset:20}},indexBuffer:r})}}function Me(n,e,t){if(n)for(const r in n){const s=r.toLocaleLowerCase(),i=e[s];if(i){let a=n[r];r==="header"&&(a=a.replace(/@in\s+[^;]+;\s*/g,"").replace(/@out\s+[^;]+;\s*/g,"")),t&&i.push(`//----${t}----//`),i.push(a)}else P(`${r} placement hook does not exist in shader`)}}const sr=/\{\{(.*?)\}\}/g;function Be(n){var r;const e={};return(((r=n.match(sr))==null?void 0:r.map(s=>s.replace(/[{()}]/g,"")))??[]).forEach(s=>{e[s]=[]}),e}function Ae(n,e){let t;const r=/@in\s+([^;]+);/g;for(;(t=r.exec(n))!==null;)e.push(t[1])}function Pe(n,e,t=!1){const r=[];Ae(e,r),n.forEach(o=>{o.header&&Ae(o.header,r)});const s=r;t&&s.sort();const i=s.map((o,l)=>`       @location(${l}) ${o},`).join(`
`);let a=e.replace(/@in\s+[^;]+;\s*/g,"");return a=a.replace("{{in}}",`
${i}
`),a}function Ue(n,e){let t;const r=/@out\s+([^;]+);/g;for(;(t=r.exec(n))!==null;)e.push(t[1])}function nr(n){const t=/\b(\w+)\s*:/g.exec(n);return t?t[1]:""}function ir(n){const e=/@.*?\s+/g;return n.replace(e,"")}function ar(n,e){const t=[];Ue(e,t),n.forEach(l=>{l.header&&Ue(l.header,t)});let r=0;const s=t.sort().map(l=>l.indexOf("builtin")>-1?l:`@location(${r++}) ${l}`).join(`,
`),i=t.sort().map(l=>`       var ${ir(l)};`).join(`
`),a=`return VSOutput(
            ${t.sort().map(l=>` ${nr(l)}`).join(`,
`)});`;let o=e.replace(/@out\s+[^;]+;\s*/g,"");return o=o.replace("{{struct}}",`
${s}
`),o=o.replace("{{start}}",`
${i}
`),o=o.replace("{{return}}",`
${a}
`),o}function Ge(n,e){let t=n;for(const r in e){const s=e[r];s.join(`
`).length?t=t.replace(`{{${r}}}`,`//-----${r} START-----//
${s.join(`
`)}
//----${r} FINISH----//`):t=t.replace(`{{${r}}}`,"")}return t}const w=Object.create(null),X=new Map;let or=0;function lr({template:n,bits:e}){const t=Xe(n,e);if(w[t])return w[t];const{vertex:r,fragment:s}=cr(n,e);return w[t]=Je(r,s,e),w[t]}function ur({template:n,bits:e}){const t=Xe(n,e);return w[t]||(w[t]=Je(n.vertex,n.fragment,e)),w[t]}function cr(n,e){const t=e.map(a=>a.vertex).filter(a=>!!a),r=e.map(a=>a.fragment).filter(a=>!!a);let s=Pe(t,n.vertex,!0);s=ar(t,s);const i=Pe(r,n.fragment,!0);return{vertex:s,fragment:i}}function Xe(n,e){return e.map(t=>(X.has(t)||X.set(t,or++),X.get(t))).sort((t,r)=>t-r).join("-")+n.vertex+n.fragment}function Je(n,e,t){const r=Be(n),s=Be(e);return t.forEach(i=>{Me(i.vertex,r,i.name),Me(i.fragment,s,i.name)}),{vertex:Ge(n,r),fragment:Ge(e,s)}}const hr=`
    @in aPosition: vec2<f32>;
    @in aUV: vec2<f32>;

    @out @builtin(position) vPosition: vec4<f32>;
    @out vUV : vec2<f32>;
    @out vColor : vec4<f32>;

    {{header}}

    struct VSOutput {
        {{struct}}
    };

    @vertex
    fn main( {{in}} ) -> VSOutput {

        var worldTransformMatrix = globalUniforms.uWorldTransformMatrix;
        var modelMatrix = mat3x3<f32>(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        var position = aPosition;
        var uv = aUV;

        {{start}}

        vColor = vec4<f32>(1., 1., 1., 1.);

        {{main}}

        vUV = uv;

        var modelViewProjectionMatrix = globalUniforms.uProjectionMatrix * worldTransformMatrix * modelMatrix;

        vPosition =  vec4<f32>((modelViewProjectionMatrix *  vec3<f32>(position, 1.0)).xy, 0.0, 1.0);

        vColor *= globalUniforms.uWorldColorAlpha;

        {{end}}

        {{return}}
    };
`,dr=`
    @in vUV : vec2<f32>;
    @in vColor : vec4<f32>;

    {{header}}

    @fragment
    fn main(
        {{in}}
      ) -> @location(0) vec4<f32> {

        {{start}}

        var outColor:vec4<f32>;

        {{main}}

        var finalColor:vec4<f32> = outColor * vColor;

        {{end}}

        return finalColor;
      };
`,fr=`
    in vec2 aPosition;
    in vec2 aUV;

    out vec4 vColor;
    out vec2 vUV;

    {{header}}

    void main(void){

        mat3 worldTransformMatrix = uWorldTransformMatrix;
        mat3 modelMatrix = mat3(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        vec2 position = aPosition;
        vec2 uv = aUV;

        {{start}}

        vColor = vec4(1.);

        {{main}}

        vUV = uv;

        mat3 modelViewProjectionMatrix = uProjectionMatrix * worldTransformMatrix * modelMatrix;

        gl_Position = vec4((modelViewProjectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);

        vColor *= uWorldColorAlpha;

        {{end}}
    }
`,pr=`

    in vec4 vColor;
    in vec2 vUV;

    out vec4 finalColor;

    {{header}}

    void main(void) {

        {{start}}

        vec4 outColor;

        {{main}}

        finalColor = outColor * vColor;

        {{end}}
    }
`,mr={name:"global-uniforms-bit",vertex:{header:`
        struct GlobalUniforms {
            uProjectionMatrix:mat3x3<f32>,
            uWorldTransformMatrix:mat3x3<f32>,
            uWorldColorAlpha: vec4<f32>,
            uResolution: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> globalUniforms : GlobalUniforms;
        `}},gr={name:"global-uniforms-bit",vertex:{header:`
          uniform mat3 uProjectionMatrix;
          uniform mat3 uWorldTransformMatrix;
          uniform vec4 uWorldColorAlpha;
          uniform vec2 uResolution;
        `}};function xr({bits:n,name:e}){const t=lr({template:{fragment:dr,vertex:hr},bits:[mr,...n]});return Ke.from({name:e,vertex:{source:t.vertex,entryPoint:"main"},fragment:{source:t.fragment,entryPoint:"main"}})}function _r({bits:n,name:e}){return new Ye({name:e,...ur({template:{vertex:fr,fragment:pr},bits:[gr,...n]})})}const br={name:"color-bit",vertex:{header:`
            @in aColor: vec4<f32>;
        `,main:`
            vColor *= vec4<f32>(aColor.rgb * aColor.a, aColor.a);
        `}},vr={name:"color-bit",vertex:{header:`
            in vec4 aColor;
        `,main:`
            vColor *= vec4(aColor.rgb * aColor.a, aColor.a);
        `}},J={};function yr(n){const e=[];if(n===1)e.push("@group(1) @binding(0) var textureSource1: texture_2d<f32>;"),e.push("@group(1) @binding(1) var textureSampler1: sampler;");else{let t=0;for(let r=0;r<n;r++)e.push(`@group(1) @binding(${t++}) var textureSource${r+1}: texture_2d<f32>;`),e.push(`@group(1) @binding(${t++}) var textureSampler${r+1}: sampler;`)}return e.join(`
`)}function Sr(n){const e=[];if(n===1)e.push("outColor = textureSampleGrad(textureSource1, textureSampler1, vUV, uvDx, uvDy);");else{e.push("switch vTextureId {");for(let t=0;t<n;t++)t===n-1?e.push("  default:{"):e.push(`  case ${t}:{`),e.push(`      outColor = textureSampleGrad(textureSource${t+1}, textureSampler${t+1}, vUV, uvDx, uvDy);`),e.push("      break;}");e.push("}")}return e.join(`
`)}function Tr(n){return J[n]||(J[n]={name:"texture-batch-bit",vertex:{header:`
                @in aTextureIdAndRound: vec2<u32>;
                @out @interpolate(flat) vTextureId : u32;
            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1)
                {
                    vPosition = vec4<f32>(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
                }
            `},fragment:{header:`
                @in @interpolate(flat) vTextureId: u32;

                ${yr(n)}
            `,main:`
                var uvDx = dpdx(vUV);
                var uvDy = dpdy(vUV);

                ${Sr(n)}
            `}}),J[n]}const Z={};function Cr(n){const e=[];for(let t=0;t<n;t++)t>0&&e.push("else"),t<n-1&&e.push(`if(vTextureId < ${t}.5)`),e.push("{"),e.push(`	outColor = texture(uTextures[${t}], vUV);`),e.push("}");return e.join(`
`)}function kr(n){return Z[n]||(Z[n]={name:"texture-batch-bit",vertex:{header:`
                in vec2 aTextureIdAndRound;
                out float vTextureId;

            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1.)
                {
                    gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
                }
            `},fragment:{header:`
                in float vTextureId;

                uniform sampler2D uTextures[${n}];

            `,main:`

                ${Cr(n)}
            `}}),Z[n]}const wr={name:"round-pixels-bit",vertex:{header:`
            fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32>
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},Rr={name:"round-pixels-bit",vertex:{header:`
            vec2 roundPixels(vec2 position, vec2 targetSize)
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},Ie={};function Mr(n){let e=Ie[n];if(e)return e;const t=new Int32Array(n);for(let r=0;r<n;r++)t[r]=r;return e=Ie[n]=new le({uTextures:{value:t,type:"i32",size:n}},{isStatic:!0}),e}class De extends Ot{constructor(e){const t=_r({name:"batch",bits:[vr,kr(e),Rr]}),r=xr({name:"batch",bits:[br,Tr(e),wr]});super({glProgram:t,gpuProgram:r,resources:{batchSamplers:Mr(e)}}),this.maxTextures=e}}let F=null;const Ze=class et extends Zt{constructor(e){super(e),this.geometry=new rr,this.name=et.extension.name,this.vertexSize=6,F??(F=new De(e.maxTextures)),this.shader=F}packAttributes(e,t,r,s,i){const a=i<<16|e.roundPixels&65535,o=e.transform,l=o.a,h=o.b,c=o.c,f=o.d,m=o.tx,p=o.ty,{positions:g,uvs:S}=e,_=e.color,d=e.attributeOffset,T=d+e.attributeSize;for(let x=d;x<T;x++){const v=x*2,y=g[v],M=g[v+1];t[s++]=l*y+c*M+m,t[s++]=f*M+h*y+p,t[s++]=S[v],t[s++]=S[v+1],r[s++]=_,r[s++]=a}}packQuadAttributes(e,t,r,s,i){const a=e.texture,o=e.transform,l=o.a,h=o.b,c=o.c,f=o.d,m=o.tx,p=o.ty,g=e.bounds,S=g.maxX,_=g.minX,d=g.maxY,T=g.minY,x=a.uvs,v=e.color,y=i<<16|e.roundPixels&65535;t[s+0]=l*_+c*T+m,t[s+1]=f*T+h*_+p,t[s+2]=x.x0,t[s+3]=x.y0,r[s+4]=v,r[s+5]=y,t[s+6]=l*S+c*T+m,t[s+7]=f*T+h*S+p,t[s+8]=x.x1,t[s+9]=x.y1,r[s+10]=v,r[s+11]=y,t[s+12]=l*S+c*d+m,t[s+13]=f*d+h*S+p,t[s+14]=x.x2,t[s+15]=x.y2,r[s+16]=v,r[s+17]=y,t[s+18]=l*_+c*d+m,t[s+19]=f*d+h*_+p,t[s+20]=x.x3,t[s+21]=x.y3,r[s+22]=v,r[s+23]=y}_updateMaxTextures(e){this.shader.maxTextures!==e&&(F=new De(e),this.shader=F)}destroy(){this.shader=null,super.destroy()}};Ze.extension={type:[u.Batcher],name:"default"};let tt=Ze;class rs{constructor(e){this.items=Object.create(null);const{renderer:t,type:r,onUnload:s,priority:i,name:a}=e;this._renderer=t,t.gc.addResourceHash(this,"items",r,i??0),this._onUnload=s,this.name=a}add(e){return this.items[e.uid]?!1:(this.items[e.uid]=e,e.once("unload",this.remove,this),e._gcLastUsed=this._renderer.gc.now,!0)}remove(e,...t){var s;if(!this.items[e.uid])return;const r=e._gpuData[this._renderer.uid];r&&((s=this._onUnload)==null||s.call(this,e,...t),e.off("unload",this.remove,this),r.destroy(),e._gpuData[this._renderer.uid]=null,this.items[e.uid]=null)}removeAll(...e){Object.values(this.items).forEach(t=>t&&this.remove(t,...e))}destroy(...e){this.removeAll(...e),this.items=Object.create(null),this._renderer=null,this._onUnload=null}}var Br=`in vec2 vMaskCoord;
in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;

uniform float uAlpha;
uniform vec4 uMaskClamp;
uniform float uInverse;
uniform float uChannel;

out vec4 finalColor;

void main(void)
{
    float clip = step(3.5,
        step(uMaskClamp.x, vMaskCoord.x) +
        step(uMaskClamp.y, vMaskCoord.y) +
        step(vMaskCoord.x, uMaskClamp.z) +
        step(vMaskCoord.y, uMaskClamp.w));

    // TODO look into why this is needed
    float npmAlpha = uAlpha;
    vec4 original = texture(uTexture, vTextureCoord);
    vec4 masky = texture(uMaskTexture, vMaskCoord);

    float a;
    if (uChannel == 1.0) {
        a = masky.a * npmAlpha * clip;
    } else {
        float alphaMul = 1.0 - npmAlpha * (1.0 - masky.a);
        a = alphaMul * masky.r * npmAlpha * clip;
    }

    if (uInverse == 1.0) {
        a = 1.0 - a;
    }

    finalColor = original * a;
}
`,Ar=`in vec2 aPosition;

out vec2 vTextureCoord;
out vec2 vMaskCoord;


uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uFilterMatrix;

vec4 filterVertexPosition(  vec2 aPosition )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
       
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(  vec2 aPosition )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

vec2 getFilterCoord( vec2 aPosition )
{
    return  ( uFilterMatrix * vec3( filterTextureCoord(aPosition), 1.0)  ).xy;
}   

void main(void)
{
    gl_Position = filterVertexPosition(aPosition);
    vTextureCoord = filterTextureCoord(aPosition);
    vMaskCoord = getFilterCoord(aPosition);
}
`,Ee=`struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct MaskUniforms {
  uFilterMatrix:mat3x3<f32>,
  uMaskClamp:vec4<f32>,
  uAlpha:f32,
  uInverse:f32,
  uChannel:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> filterUniforms : MaskUniforms;
@group(1) @binding(1) var uMaskTexture: texture_2d<f32>;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) filterUv : vec2<f32>,
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

fn globalTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
  return  (aPosition.xy / gfu.uGlobalFrame.zw) + (gfu.uGlobalFrame.xy / gfu.uGlobalFrame.zw);
}

fn getFilterCoord(aPosition:vec2<f32> ) -> vec2<f32>
{
  return ( filterUniforms.uFilterMatrix * vec3( filterTextureCoord(aPosition), 1.0)  ).xy;
}

fn getSize() -> vec2<f32>
{
  return gfu.uGlobalFrame.zw;
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition),
   getFilterCoord(aPosition)
  );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @location(1) filterUv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {

    var maskClamp = filterUniforms.uMaskClamp;
    var uAlpha = filterUniforms.uAlpha;

    var clip = step(3.5,
      step(maskClamp.x, filterUv.x) +
      step(maskClamp.y, filterUv.y) +
      step(filterUv.x, maskClamp.z) +
      step(filterUv.y, maskClamp.w));

    var mask = textureSample(uMaskTexture, uSampler, filterUv);
    var source = textureSample(uTexture, uSampler, uv);

    var a: f32;
    if (filterUniforms.uChannel == 1.0) {
        a = mask.a * uAlpha * clip;
    } else {
        var alphaMul = 1.0 - uAlpha * (1.0 - mask.a);
        a = alphaMul * mask.r * uAlpha * clip;
    }

    if (filterUniforms.uInverse == 1.0) {
        a = 1.0 - a;
    }

    return source * a;
}
`;class Pr extends Wt{constructor(e){const{sprite:t,...r}=e,s=new At(t.texture),i=new le({uFilterMatrix:{value:new R,type:"mat3x3<f32>"},uMaskClamp:{value:s.uClampFrame,type:"vec4<f32>"},uAlpha:{value:1,type:"f32"},uInverse:{value:e.inverse?1:0,type:"f32"},uChannel:{value:e.channel==="alpha"?1:0,type:"f32"}}),a=Ke.from({vertex:{source:Ee,entryPoint:"mainVertex"},fragment:{source:Ee,entryPoint:"mainFragment"}}),o=Ye.from({vertex:Ar,fragment:Br,name:"mask-filter"});super({...r,gpuProgram:a,glProgram:o,clipToViewport:!1,resources:{filterUniforms:i,uMaskTexture:t.texture.source}}),this.sprite=t,this._textureMatrix=s}setSprite(e){this.sprite=e;const t=this._getSafeTexture();this._textureMatrix.texture=t,this.resources.uMaskTexture=t.source}set inverse(e){this.resources.filterUniforms.uniforms.uInverse=e?1:0}get inverse(){return this.resources.filterUniforms.uniforms.uInverse===1}set channel(e){this.resources.filterUniforms.uniforms.uChannel=e==="alpha"?1:0}get channel(){return this.resources.filterUniforms.uniforms.uChannel===1?"alpha":"red"}apply(e,t,r,s){const i=this._getSafeTexture();this._textureMatrix.texture=i,e.calculateSpriteMatrix(this.resources.filterUniforms.uniforms.uFilterMatrix,this.sprite).prepend(this._textureMatrix.mapCoord),this.resources.uMaskTexture=i.source,e.applyFilter(this,t,r,s)}_getSafeTexture(){const e=this.sprite.texture;return e.destroyed||!e.source||e.source.destroyed?(P("[MaskFilter] The mask texture was destroyed while the mask is still in use. Remove the mask before destroying its texture."),C.EMPTY):e}destroy(e=!1){this._textureMatrix.destroy(),super.destroy(e)}}function Ur(n,e,t){const r=(n>>24&255)/255;e[t++]=(n&255)/255*r,e[t++]=(n>>8&255)/255*r,e[t++]=(n>>16&255)/255*r,e[t++]=r}class rt{constructor(){this.batcherName="default",this.topology="triangle-list",this.attributeSize=4,this.indexSize=6,this.packAsQuad=!0,this.roundPixels=0,this._attributeStart=0,this._batcher=null,this._batch=null}get blendMode(){return this.renderable.groupBlendMode}get color(){return this.renderable.groupColorAlpha}reset(){this.renderable=null,this.texture=null,this._batcher=null,this._batch=null,this.bounds=null}destroy(){this.reset()}}const ue=class st{constructor(e,t){var r,s;this.state=$t.for2d(),this._batchersByInstructionSet=Object.create(null),this._activeBatches=Object.create(null),this.renderer=e,this._adaptor=t,(s=(r=this._adaptor).init)==null||s.call(r,this)}static getBatcher(e,t){return new this._availableBatchers[e]({maxTextures:t})}buildStart(e){let t=this._batchersByInstructionSet[e.uid];t||(t=this._batchersByInstructionSet[e.uid]=Object.create(null),t.default||(t.default=new tt({maxTextures:this.renderer.limits.maxBatchableTextures}))),this._activeBatches=t,this._activeBatch=this._activeBatches.default;for(const r in this._activeBatches)this._activeBatches[r].begin()}addToBatch(e,t){if(this._activeBatch.name!==e.batcherName){this._activeBatch.break(t);let r=this._activeBatches[e.batcherName];r||(r=this._activeBatches[e.batcherName]=st.getBatcher(e.batcherName,this.renderer.limits.maxBatchableTextures),r.begin()),this._activeBatch=r}this._activeBatch.add(e)}break(e){this._activeBatch.break(e)}buildEnd(e){this._activeBatch.break(e);const t=this._activeBatches;for(const r in t){const s=t[r],i=s.geometry;i.indexBuffer.setDataWithSize(s.indexBuffer,s.indexSize,!0),i.buffers[0].setDataWithSize(s.attributeBuffer.float32View,s.attributeSize,!1)}}upload(e){const t=this._batchersByInstructionSet[e.uid];for(const r in t){const s=t[r],i=s.geometry;s.dirty&&(s.dirty=!1,i.buffers[0].update(s.attributeSize*4))}}execute(e){if(e.action==="startBatch"){const t=e.batcher,r=t.geometry,s=t.shader;this._adaptor.start(this,r,s)}this._adaptor.execute(this,e)}destroyInstructionSet(e){const t=this._batchersByInstructionSet[e.uid];if(t){for(const r in t)t[r].destroy();delete this._batchersByInstructionSet[e.uid],this._activeBatches===t&&(this._activeBatches=Object.create(null),this._activeBatch=null)}}destroy(){this.state=null,this.renderer=null,this._adaptor=null;for(const e in this._activeBatches)this._activeBatches[e].destroy();this._activeBatches=null}};ue.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"batch"};ue._availableBatchers=Object.create(null);let nt=ue;ie.handleByMap(u.Batcher,nt._availableBatchers);ie.add(tt);const Gr=new ae;class Ir extends Oe{constructor(){super(),this._placeholderSprite=new Ut(C.EMPTY),this.filters=[new Pr({sprite:this._placeholderSprite,inverse:!1,resolution:"inherit",antialias:"inherit"})]}get sprite(){return this.filters[0].sprite}set sprite(e){this.filters[0].setSprite(e)}get inverse(){return this.filters[0].inverse}set inverse(e){this.filters[0].inverse=e}get channel(){return this.filters[0].channel}set channel(e){this.filters[0].channel=e}reset(){this._placeholderSprite.texture=C.EMPTY,this.sprite=this._placeholderSprite}}class it{constructor(e){this._activeMaskStage=[],this._usedEffects=[],this._renderer=e,e.runners.postrender.add(this)}push(e,t,r){const s=this._renderer;if(s.renderPipes.batch.break(r),r.add({renderPipeId:"alphaMask",action:"pushMaskBegin",mask:e,inverse:t._maskOptions.inverse,canBundle:!1,maskedContainer:t}),e.inverse=t._maskOptions.inverse,e.channel=t._maskOptions.channel??"red",e.renderMaskToTexture){const i=e.mask;i.includeInBuild=!0,i.collectRenderables(r,s,null),i.includeInBuild=!1}s.renderPipes.batch.break(r),r.add({renderPipeId:"alphaMask",action:"pushMaskEnd",mask:e,maskedContainer:t,inverse:t._maskOptions.inverse,canBundle:!1})}pop(e,t,r){this._renderer.renderPipes.batch.break(r),r.add({renderPipeId:"alphaMask",action:"popMaskEnd",mask:e,inverse:t._maskOptions.inverse,canBundle:!1})}execute(e){const t=this._renderer,r=e.mask.renderMaskToTexture;if(e.action==="pushMaskBegin"){const s=Y.get(Ir);if(s.inverse=e.inverse,s.channel=e.mask.channel,r){e.mask.mask.measurable=!0;const i=Pt(e.mask.mask,!0,Gr);e.mask.mask.measurable=!1,i.ceil();const a=t.renderTarget.renderTarget.colorTexture.source,o=U.getOptimalTexture({width:i.width,height:i.height,resolution:a._resolution,antialias:a.antialias});t.renderTarget.push({target:o,clear:!0}),t.globalUniforms.push({offset:i,worldColor:4294967295});const l=s.sprite;l.texture=o,l.worldTransform.tx=i.minX,l.worldTransform.ty=i.minY,this._activeMaskStage.push({filterEffect:s,maskedContainer:e.maskedContainer,filterTexture:o})}else s.sprite=e.mask.mask,this._activeMaskStage.push({filterEffect:s,maskedContainer:e.maskedContainer})}else if(e.action==="pushMaskEnd"){const s=this._activeMaskStage[this._activeMaskStage.length-1];r&&(t.type===Q.WEBGL&&t.renderTarget.finishRenderPass(),t.renderTarget.pop(),t.globalUniforms.pop()),t.filter.push({renderPipeId:"filter",action:"pushFilter",container:s.maskedContainer,filterEffect:s.filterEffect,canBundle:!1})}else if(e.action==="popMaskEnd"){t.filter.pop();const s=this._activeMaskStage.pop();r&&U.returnTexture(s.filterTexture),this._usedEffects.push(s.filterEffect)}}postrender(){const e=this._usedEffects;for(let t=0;t<e.length;t++)Y.return(e[t]);e.length=0}destroy(){this.postrender(),this._renderer.runners.postrender.remove(this),this._renderer=null,this._activeMaskStage=null,this._usedEffects=null}}it.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"alphaMask"};class at{constructor(e){this._colorStack=[],this._colorStackIndex=0,this._currentColor=0,this._renderer=e}buildStart(){this._colorStack[0]=15,this._colorStackIndex=1,this._currentColor=15}push(e,t,r){this._renderer.renderPipes.batch.break(r);const i=this._colorStack;i[this._colorStackIndex]=i[this._colorStackIndex-1]&e.mask;const a=this._colorStack[this._colorStackIndex];a!==this._currentColor&&(this._currentColor=a,r.add({renderPipeId:"colorMask",colorMask:a,canBundle:!1})),this._colorStackIndex++}pop(e,t,r){this._renderer.renderPipes.batch.break(r);const i=this._colorStack;this._colorStackIndex--;const a=i[this._colorStackIndex-1];a!==this._currentColor&&(this._currentColor=a,r.add({renderPipeId:"colorMask",colorMask:a,canBundle:!1}))}execute(e){this._renderer.colorMask.setMask(e.colorMask)}destroy(){this._renderer=null,this._colorStack=null}}at.extension={type:[u.WebGLPipes,u.WebGPUPipes],name:"colorMask"};class ot{constructor(e){this._maskHash=new WeakMap,this._renderer=e}push(e,t,r){const s=e,i=this._renderer;i.renderPipes.batch.break(r),i.renderPipes.blendMode.setBlendMode(s.mask,"none",r),r.add({renderPipeId:"stencilMask",action:"pushMaskBegin",mask:e,inverse:t._maskOptions.inverse,canBundle:!1});const a=s.mask;a.includeInBuild=!0,this._maskHash.has(s)||this._maskHash.set(s,{instructionsStart:0,instructionsLength:0});const o=this._maskHash.get(s);o.instructionsStart=r.instructionSize,a.collectRenderables(r,i,null),a.includeInBuild=!1,i.renderPipes.batch.break(r),r.add({renderPipeId:"stencilMask",action:"pushMaskEnd",mask:e,inverse:t._maskOptions.inverse,canBundle:!1});const l=r.instructionSize-o.instructionsStart-1;o.instructionsLength=l}pop(e,t,r){const s=e,i=this._renderer;i.renderPipes.batch.break(r),i.renderPipes.blendMode.setBlendMode(s.mask,"none",r),r.add({renderPipeId:"stencilMask",action:"popMaskBegin",inverse:t._maskOptions.inverse,canBundle:!1});const a=this._maskHash.get(e);for(let o=0;o<a.instructionsLength;o++)r.instructions[r.instructionSize++]=r.instructions[a.instructionsStart++];r.add({renderPipeId:"stencilMask",action:"popMaskEnd",canBundle:!1})}execute(e){const r=this._renderer,s=r.renderTarget.getGpuRenderTarget(r.renderTarget.renderTarget);let i=s.maskStackIndex;e.action==="pushMaskBegin"?(r.renderTarget.ensureDepthStencil(),r.stencil.setStencilMode(k.RENDERING_MASK_ADD,i),i++,r.colorMask.setMask(0)):e.action==="pushMaskEnd"?(e.inverse?r.stencil.setStencilMode(k.INVERSE_MASK_ACTIVE,i):r.stencil.setStencilMode(k.MASK_ACTIVE,i),r.colorMask.setMask(15)):e.action==="popMaskBegin"?(r.colorMask.setMask(0),i!==0?r.stencil.setStencilMode(k.RENDERING_MASK_REMOVE,i):(r.renderTarget.clear(null,$.STENCIL),r.stencil.setStencilMode(k.DISABLED,i)),i--):e.action==="popMaskEnd"&&(e.inverse?r.stencil.setStencilMode(k.INVERSE_MASK_ACTIVE,i):r.stencil.setStencilMode(k.MASK_ACTIVE,i),r.colorMask.setMask(15)),s.maskStackIndex=i}destroy(){this._renderer=null,this._maskHash=null}}ot.extension={type:[u.WebGLPipes,u.WebGPUPipes],name:"stencilMask"};class lt{constructor(e){this._renderer=e}updateRenderable(){}destroyRenderable(){}validateRenderable(){return!1}addRenderable(e,t){this._renderer.renderPipes.batch.break(t),t.add(e)}execute(e){e.isRenderable&&e.render(this._renderer)}destroy(){this._renderer=null}}lt.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"customRender"};function se(n,e){const t=n.instructionSet,r=t.instructions;for(let s=0;s<t.instructionSize;s++){const i=r[s];e[i.renderPipeId].execute(i)}}class ut{constructor(e){this._renderer=e}addRenderGroup(e,t){e.isCachedAsTexture?this._addRenderableCacheAsTexture(e,t):this._addRenderableDirect(e,t)}execute(e){e.isRenderable&&(e.isCachedAsTexture?this._executeCacheAsTexture(e):this._executeDirect(e))}destroy(){this._renderer=null}_addRenderableDirect(e,t){this._renderer.renderPipes.batch.break(t),e._batchableRenderGroup&&(Y.return(e._batchableRenderGroup),e._batchableRenderGroup=null),t.add(e)}_addRenderableCacheAsTexture(e,t){const r=e._batchableRenderGroup??(e._batchableRenderGroup=Y.get(rt));r.renderable=e.root,r.transform=e.root.relativeGroupTransform,r.texture=e.texture,r.bounds=e._textureBounds,t.add(e),this._renderer.renderPipes.blendMode.pushBlendMode(e,e.root.groupBlendMode,t),this._renderer.renderPipes.batch.addToBatch(r,t),this._renderer.renderPipes.blendMode.popBlendMode(t)}_executeCacheAsTexture(e){if(e.textureNeedsUpdate){e.textureNeedsUpdate=!1;const t=new R().translate(-e._textureBounds.x,-e._textureBounds.y);this._renderer.renderTarget.push({target:e.texture,clear:!0,frame:e.texture.frame}),this._renderer.globalUniforms.push({worldTransformMatrix:t,worldColor:4294967295,offset:{x:0,y:0}}),se(e,this._renderer.renderPipes),this._renderer.renderTarget.finishRenderPass(),this._renderer.renderTarget.pop(),this._renderer.globalUniforms.pop()}e._batchableRenderGroup._batcher.updateElement(e._batchableRenderGroup),e._batchableRenderGroup._batcher.geometry.buffers[0].update()}_executeDirect(e){this._renderer.globalUniforms.push({worldTransformMatrix:e.inverseParentTextureTransform,worldColor:e.worldColorAlpha}),se(e,this._renderer.renderPipes),this._renderer.globalUniforms.pop()}}ut.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"renderGroup"};class ct{constructor(e){this._renderer=e}addRenderable(e,t){const r=this._getGpuSprite(e);e.didViewUpdate&&this._updateBatchableSprite(e,r),this._renderer.renderPipes.batch.addToBatch(r,t)}updateRenderable(e){const t=this._getGpuSprite(e);e.didViewUpdate&&this._updateBatchableSprite(e,t),t._batcher.updateElement(t)}validateRenderable(e){const t=this._getGpuSprite(e);return!t._batcher.checkAndUpdateTexture(t,e._texture)}_updateBatchableSprite(e,t){t.bounds=e.visualBounds,t.texture=e._texture}_getGpuSprite(e){return e._gpuData[this._renderer.uid]||this._initGPUSprite(e)}_initGPUSprite(e){const t=new rt;return t.renderable=e,t.transform=e.groupTransform,t.texture=e._texture,t.bounds=e.visualBounds,t.roundPixels=this._renderer._roundPixels|e._roundPixels,e._gpuData[this._renderer.uid]=t,t}destroy(){this._renderer=null}}ct.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"sprite"};const O={};ie.handle(u.BlendMode,n=>{if(!n.name)throw new Error("BlendMode extension must have a name property");O[n.name]=n.ref},n=>{delete O[n.name]});class ht{constructor(e){this._blendModeStack=[],this._isAdvanced=!1,this._filterHash=Object.create(null),this._renderer=e,this._renderer.runners.prerender.add(this)}prerender(){this._activeBlendMode="normal",this._isAdvanced=!1}pushBlendMode(e,t,r){this._blendModeStack.push(t),this.setBlendMode(e,t,r)}popBlendMode(e){this._blendModeStack.pop();const t=this._blendModeStack[this._activeBlendMode.length-1]??"normal";this.setBlendMode(null,t,e)}setBlendMode(e,t,r){var i;const s=e instanceof _e;if(this._activeBlendMode===t){this._isAdvanced&&e&&!s&&((i=this._renderableList)==null||i.push(e));return}this._isAdvanced&&this._endAdvancedBlendMode(r),this._activeBlendMode=t,e&&(this._isAdvanced=!!O[t],this._isAdvanced&&this._beginAdvancedBlendMode(e,r))}_beginAdvancedBlendMode(e,t){this._renderer.renderPipes.batch.break(t);const r=this._activeBlendMode;if(!O[r]){P(`Unable to assign BlendMode: '${r}'. You may want to include: import 'pixi.js/advanced-blend-modes'`);return}const s=this._ensureFilterEffect(r),i=e instanceof _e,a={renderPipeId:"filter",action:"pushFilter",filterEffect:s,renderables:i?null:[e],container:i?e.root:null,canBundle:!1};this._renderableList=a.renderables,t.add(a)}_ensureFilterEffect(e){let t=this._filterHash[e];return t||(t=this._filterHash[e]=new Oe,t.filters=[new O[e]]),t}_endAdvancedBlendMode(e){this._isAdvanced=!1,this._renderableList=null,this._renderer.renderPipes.batch.break(e),e.add({renderPipeId:"filter",action:"popFilter",canBundle:!1})}buildStart(){this._isAdvanced=!1}buildEnd(e){this._isAdvanced&&this._endAdvancedBlendMode(e)}destroy(){this._renderer=null,this._renderableList=null;for(const e in this._filterHash)this._filterHash[e].destroy();this._filterHash=null}}ht.extension={type:[u.WebGLPipes,u.WebGPUPipes,u.CanvasPipes],name:"blendMode"};function ne(n,e){e||(e=0);for(let t=e;t<n.length&&n[t];t++)n[t]=null}const Dr=new K,ze=$e|je|Ne;function dt(n,e=!1){Er(n);const t=n.childrenToUpdate,r=n.updateTick++;for(const s in t){const i=Number(s),a=t[s],o=a.list,l=a.index;for(let h=0;h<l;h++){const c=o[h];c.parentRenderGroup===n&&c.relativeRenderGroupDepth===i&&ft(c,r,0)}ne(o,l),a.index=0}if(e)for(let s=0;s<n.renderGroupChildren.length;s++)dt(n.renderGroupChildren[s],e)}function Er(n){const e=n.root;let t;if(n.renderGroupParent){const r=n.renderGroupParent;n.worldTransform.appendFrom(e.relativeGroupTransform,r.worldTransform),n.worldColor=We(e.groupColor,r.worldColor),t=e.groupAlpha*r.worldAlpha}else n.worldTransform.copyFrom(e.localTransform),n.worldColor=e.localColor,t=e.localAlpha;t=t<0?0:t>1?1:t,n.worldAlpha=t,n.worldColorAlpha=n.worldColor+((t*255|0)<<24)}function ft(n,e,t){if(e===n.updateTick)return;n.updateTick=e,n.didChange=!1;const r=n.localTransform;n.updateLocalTransform();const s=n.parent;if(s&&!s.renderGroup?(t|=n._updateFlags,n.relativeGroupTransform.appendFrom(r,s.relativeGroupTransform),t&ze&&Fe(n,s,t)):(t=n._updateFlags,n.relativeGroupTransform.copyFrom(r),t&ze&&Fe(n,Dr,t)),!n.renderGroup){const i=n.children,a=i.length;for(let h=0;h<a;h++)ft(i[h],e,t);const o=n.parentRenderGroup,l=n;l.renderPipeId&&!o.structureDidChange&&o.updateRenderable(l)}}function Fe(n,e,t){if(t&je){n.groupColor=We(n.localColor,e.groupColor);let r=n.localAlpha*e.groupAlpha;r=r<0?0:r>1?1:r,n.groupAlpha=r,n.groupColorAlpha=n.groupColor+((r*255|0)<<24)}t&Ne&&(n.groupBlendMode=n.localBlendMode==="inherit"?e.groupBlendMode:n.localBlendMode),t&$e&&(n.globalDisplayStatus=n.localDisplayStatus&e.globalDisplayStatus),n._updateFlags=0}function zr(n,e){const{list:t}=n.childrenRenderablesToUpdate;let r=!1;for(let s=0;s<n.childrenRenderablesToUpdate.index;s++){const i=t[s];if(r=e[i.renderPipeId].validateRenderable(i),r)break}return n.structureDidChange=r,r}const Fr=new R;class pt{constructor(e){this._renderer=e}render({container:e,transform:t}){const r=e.parent,s=e.renderGroup.renderGroupParent;e.parent=null,e.renderGroup.renderGroupParent=null;const i=this._renderer,a=Fr;t&&(a.copyFrom(e.renderGroup.localTransform),e.renderGroup.localTransform.copyFrom(t));const o=i.renderPipes;this._updateCachedRenderGroups(e.renderGroup,null),this._updateRenderGroups(e.renderGroup),i.globalUniforms.start({worldTransformMatrix:t?e.renderGroup.localTransform:e.renderGroup.worldTransform,worldColor:e.renderGroup.worldColorAlpha}),se(e.renderGroup,o),o.uniformBatch&&o.uniformBatch.renderEnd(),t&&e.renderGroup.localTransform.copyFrom(a),e.parent=r,e.renderGroup.renderGroupParent=s}destroy(){this._renderer=null}_updateCachedRenderGroups(e,t){if(e._parentCacheAsTextureRenderGroup=t,e.isCachedAsTexture){if(!e.textureNeedsUpdate)return;t=e}for(let r=e.renderGroupChildren.length-1;r>=0;r--)this._updateCachedRenderGroups(e.renderGroupChildren[r],t);if(e.invalidateMatrices(),e.isCachedAsTexture){if(e.textureNeedsUpdate){const r=e.root.getLocalBounds(),s=this._renderer,i=e.textureOptions.resolution||s.view.resolution,a=e.textureOptions.antialias??s.view.antialias,o=e.textureOptions.scaleMode??"linear",l=e.texture;r.ceil(),e.texture&&U.returnTexture(e.texture);const h=U.getOptimalTexture({width:r.width,height:r.height,resolution:i,antialias:a,scaleMode:o});e.texture=h,e._textureBounds||(e._textureBounds=new ae),e._textureBounds.copyFrom(r),l!==e.texture&&e.renderGroupParent&&(e.renderGroupParent.structureDidChange=!0)}}else e.texture&&(U.returnTexture(e.texture),e.texture=null)}_updateRenderGroups(e){const t=this._renderer,r=t.renderPipes;if(e.runOnRender(t),e.instructionSet.renderPipes=r,e.structureDidChange?ne(e.childrenRenderablesToUpdate.list,0):zr(e,r),dt(e),e.structureDidChange?(e.structureDidChange=!1,this._buildInstructions(e,t)):this._updateRenderables(e),e.childrenRenderablesToUpdate.index=0,t.renderPipes.batch.upload(e.instructionSet),!(e.isCachedAsTexture&&!e.textureNeedsUpdate))for(let s=0;s<e.renderGroupChildren.length;s++)this._updateRenderGroups(e.renderGroupChildren[s])}_updateRenderables(e){const{list:t,index:r}=e.childrenRenderablesToUpdate;for(let s=0;s<r;s++){const i=t[s];i.didViewUpdate&&e.updateRenderable(i)}ne(t,r)}_buildInstructions(e,t){const r=e.root,s=e.instructionSet;s.reset();const i=t.renderPipes?t:t.batch.renderer,a=i.renderPipes;a.batch.buildStart(s),a.blendMode.buildStart(),a.colorMask.buildStart(),r.sortableChildren&&r.sortChildren(),r.collectRenderablesWithEffects(s,i,null),a.batch.buildEnd(s),a.blendMode.buildEnd(s)}}pt.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"renderGroup"};const ce=class mt{constructor(){this.clearBeforeRender=!0,this._backgroundColor=new te(0),this.color=this._backgroundColor,this.alpha=1}init(e){e={...mt.defaultOptions,...e},this.clearBeforeRender=e.clearBeforeRender,this.color=e.background||e.backgroundColor||this._backgroundColor,this.alpha=e.backgroundAlpha,this._backgroundColor.setAlpha(e.backgroundAlpha)}get color(){return this._backgroundColor}set color(e){te.shared.setValue(e).alpha<1&&this._backgroundColor.alpha===1&&P("Cannot set a transparent background on an opaque canvas. To enable transparency, set backgroundAlpha < 1 when initializing your Application."),this._backgroundColor.setValue(e)}get alpha(){return this._backgroundColor.alpha}set alpha(e){this._backgroundColor.setAlpha(e)}get colorRgba(){return this._backgroundColor.toArray()}destroy(){}};ce.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"background",priority:0};ce.defaultOptions={backgroundAlpha:1,backgroundColor:0,clearBeforeRender:!0};let Hr=ce;const ee={png:"image/png",jpg:"image/jpeg",webp:"image/webp"},he=class gt{constructor(e){this._renderer=e}_normalizeOptions(e,t={}){return e instanceof K||e instanceof C?{target:e,...t}:{...t,...e}}async image(e){const t=oe.get().createImage();return t.src=await this.base64(e),t}async base64(e){e=this._normalizeOptions(e,gt.defaultImageOptions);const{format:t,quality:r}=e,s=this.canvas(e);if(s.toBlob!==void 0)return new Promise((i,a)=>{s.toBlob(o=>{if(!o){a(new Error("ICanvas.toBlob failed!"));return}const l=new FileReader;l.onload=()=>i(l.result),l.onerror=a,l.readAsDataURL(o)},ee[t],r)});if(s.toDataURL!==void 0)return s.toDataURL(ee[t],r);if(s.convertToBlob!==void 0){const i=await s.convertToBlob({type:ee[t],quality:r});return new Promise((a,o)=>{const l=new FileReader;l.onload=()=>a(l.result),l.onerror=o,l.readAsDataURL(i)})}throw new Error("Extract.base64() requires ICanvas.toDataURL, ICanvas.toBlob, or ICanvas.convertToBlob to be implemented")}canvas(e){e=this._normalizeOptions(e);const t=e.target,r=this._renderer;if(t instanceof C)return r.texture.generateCanvas(t);const s=r.textureGenerator.generateTexture(e),i=r.texture.generateCanvas(s);return s.destroy(!0),i}pixels(e){e=this._normalizeOptions(e);const t=e.target,r=this._renderer,s=t instanceof C?t:r.textureGenerator.generateTexture(e),i=r.texture.getPixels(s);return t instanceof K&&s.destroy(!0),i}texture(e){return e=this._normalizeOptions(e),e.target instanceof C?e.target:this._renderer.textureGenerator.generateTexture(e)}download(e){e=this._normalizeOptions(e);const t=this.canvas(e),r=document.createElement("a");r.download=e.filename??"image.png",r.href=t.toDataURL("image/png"),document.body.appendChild(r),r.click(),document.body.removeChild(r)}log(e){const t=e.width??200;e=this._normalizeOptions(e);const r=this.canvas(e),s=r.toDataURL();console.log(`[Pixi Texture] ${r.width}px ${r.height}px`);const i=["font-size: 1px;",`padding: ${t}px 300px;`,`background: url(${s}) no-repeat;`,"background-size: contain;"].join(" ");console.log("%c ",i)}destroy(){this._renderer=null}};he.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"extract"};he.defaultImageOptions={format:"png",quality:1};let Vr=he;class de extends C{static create(e){const{dynamic:t,textureOptions:r,...s}=e;return new de({...r,source:new H(s),dynamic:t??!1})}resize(e,t,r){return this.source.resize(e,t,r),this}}const Lr=new V,Or=new ae,Wr=[0,0,0,0];class xt{constructor(e){this._renderer=e}generateTexture(e){var c;e instanceof K&&(e={target:e,frame:void 0,textureSourceOptions:{},resolution:void 0});const t=e.resolution||this._renderer.resolution,r=e.antialias||this._renderer.view.antialias,s=e.target;let i=e.clearColor;i?i=Array.isArray(i)&&i.length===4?i:te.shared.setValue(i).toArray():i=Wr;const a=((c=e.frame)==null?void 0:c.copyTo(Lr))||Gt(s,Or).rectangle,o=e.defaultAnchor&&{defaultAnchor:e.defaultAnchor};a.width=Math.max(a.width,1/t)|0,a.height=Math.max(a.height,1/t)|0;const l=de.create({...e.textureSourceOptions,width:a.width,height:a.height,resolution:t,antialias:r,textureOptions:o}),h=R.shared.translate(-a.x,-a.y);return this._renderer.render({container:s,transform:h,target:l,clearColor:i}),l.source.updateMipmaps(),l}destroy(){this._renderer=null}}xt.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"textureGenerator"};function $r(n){let e=!1;for(const r in n)if(n[r]==null){e=!0;break}if(!e)return n;const t=Object.create(null);for(const r in n){const s=n[r];s&&(t[r]=s)}return t}function jr(n){let e=0;for(let t=0;t<n.length;t++)n[t]==null?e++:n[t-e]=n[t];return n.length-=e,n}const fe=class _t{constructor(e){this._managedResources=[],this._managedResourceHashes=[],this._managedCollections=[],this._ready=!1,this._running=!1,this._renderer=e}init(e){e={..._t.defaultOptions,...e},this.maxUnusedTime=e.gcMaxUnusedTime,this._frequency=e.gcFrequency,this.enabled=e.gcActive,this.now=performance.now()}get enabled(){return!!this._handler}set enabled(e){this.enabled!==e&&(e?(this._handler=this._renderer.scheduler.repeat(()=>{this._ready=!0},this._frequency,!1),this._collectionsHandler=this._renderer.scheduler.repeat(()=>{for(const t of this._managedCollections){const{context:r,collection:s,type:i}=t;i==="hash"?r[s]=$r(r[s]):r[s]=jr(r[s])}},this._frequency)):(this._renderer.scheduler.cancel(this._handler),this._renderer.scheduler.cancel(this._collectionsHandler),this._handler=0,this._collectionsHandler=0))}prerender({container:e}){this.now=performance.now(),e.renderGroup.gcTick=this._renderer.tick++,this._updateInstructionGCTick(e.renderGroup,e.renderGroup.gcTick)}postrender(){!this._ready||!this.enabled||(this.run(),this._ready=!1)}_updateInstructionGCTick(e,t){e.instructionSet.gcTick=t,e.gcTick=t;for(const r of e.renderGroupChildren)this._updateInstructionGCTick(r,t)}addCollection(e,t,r){this._managedCollections.push({context:e,collection:t,type:r})}addResource(e,t){var s,i;if(e._gcLastUsed!==-1){e._gcLastUsed=this.now,(s=e._onTouch)==null||s.call(e,this.now);return}const r=this._managedResources.length;e._gcData={index:r,type:t},e._gcLastUsed=this.now,(i=e._onTouch)==null||i.call(e,this.now),e.once("unload",this.removeResource,this),this._managedResources.push(e)}removeResource(e){const t=e._gcData;if(!t)return;const r=t.index,s=this._managedResources.length-1;if(this._running)this._managedResources[r]=null;else{if(r!==s){const i=this._managedResources[s];this._managedResources[r]=i,i._gcData.index=r}this._managedResources.length--}e._gcData=null,e._gcLastUsed=-1}addResourceHash(e,t,r,s=0){this._managedResourceHashes.push({context:e,hash:t,type:r,priority:s}),this._managedResourceHashes.sort((i,a)=>i.priority-a.priority)}run(){if(this._running)return;const e=performance.now(),t=this._managedResourceHashes,r=this._managedResources;this._running=!0;try{for(const i of t)this.runOnHash(i,e);const s=r.length;for(let i=0;i<s;i++){const a=r[i];a&&this.runOnResource(a,e)}}finally{let s=0;for(let i=0;i<r.length;i++){const a=r[i];a&&(s!==i&&(r[s]=a,a._gcData.index=s),s++)}r.length=s,this._running=!1}}updateRenderableGCTick(e,t){var i,a;const r=e.renderGroup??e.parentRenderGroup,s=((i=r==null?void 0:r.instructionSet)==null?void 0:i.gcTick)??-1;((r==null?void 0:r.gcTick)??0)===s&&(e._gcLastUsed=t,(a=e._onTouch)==null||a.call(e,t))}runOnResource(e,t){e._gcData.type==="renderable"&&this.updateRenderableGCTick(e,t),!(t-e._gcLastUsed<this.maxUnusedTime||!e.autoGarbageCollect)&&(e.off("unload",this.removeResource,this),e.unload(),this.removeResource(e))}_createHashClone(e,t){const r=Object.create(null);for(const s in e){if(s===t)break;e[s]!==null&&(r[s]=e[s])}return r}runOnHash(e,t){var h;const{context:r,hash:s,type:i}=e,a=r[s];let o=null,l=0;for(const c in a){const f=a[c];if(f===null){l++,l===1e4&&!o&&(o=this._createHashClone(a,c));continue}if(f._gcLastUsed===-1){f._gcLastUsed=t,(h=f._onTouch)==null||h.call(f,t),o&&(o[c]=f);continue}if(i==="renderable"&&this.updateRenderableGCTick(f,t),!(t-f._gcLastUsed<this.maxUnusedTime)&&f.autoGarbageCollect){if(i==="renderable"){const p=f,g=p.renderGroup??p.parentRenderGroup;g&&(g.structureDidChange=!0)}f.unload(),f._gcData=null,f._gcLastUsed=-1,o||(l+1!==1e4?(a[c]=null,l++):o=this._createHashClone(a,c))}else o&&(o[c]=f)}o&&(r[s]=o)}destroy(){this.enabled=!1,this._managedResources.forEach(e=>{e==null||e.off("unload",this.removeResource,this)}),this._managedResources.length=0,this._managedResourceHashes.length=0,this._managedCollections.length=0,this._renderer=null}};fe.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"gc",priority:0};fe.defaultOptions={gcActive:!0,gcMaxUnusedTime:6e4,gcFrequency:3e4};let Nr=fe;class bt{constructor(e){this._stackIndex=0,this._globalUniformDataStack=[],this._uniformsPool=[],this._activeUniforms=[],this._bindGroupPool=[],this._activeBindGroups=[],this._renderer=e}reset(){this._stackIndex=0;for(let e=0;e<this._activeUniforms.length;e++)this._uniformsPool.push(this._activeUniforms[e]);for(let e=0;e<this._activeBindGroups.length;e++)this._bindGroupPool.push(this._activeBindGroups[e]);this._activeUniforms.length=0,this._activeBindGroups.length=0}start(e){this.reset(),this.push(e)}bind({size:e,projectionMatrix:t,worldTransformMatrix:r,worldColor:s,offset:i}){const a=this._renderer.renderTarget.renderTarget,o=this._stackIndex?this._globalUniformDataStack[this._stackIndex-1]:{worldTransformMatrix:new R,worldColor:4294967295,offset:new It},l={projectionMatrix:t||this._renderer.renderTarget.projectionMatrix,resolution:e||a.size,worldTransformMatrix:r||o.worldTransformMatrix,worldColor:s||o.worldColor,offset:i||o.offset,bindGroup:null},h=this._uniformsPool.pop()||this._createUniforms();this._activeUniforms.push(h);const c=h.uniforms;c.uProjectionMatrix=l.projectionMatrix,c.uResolution=l.resolution,c.uWorldTransformMatrix.copyFrom(l.worldTransformMatrix),c.uWorldTransformMatrix.tx-=l.offset.x,c.uWorldTransformMatrix.ty-=l.offset.y,Ur(l.worldColor,c.uWorldColorAlpha,0),h.update();let f;this._renderer.renderPipes.uniformBatch?f=this._renderer.renderPipes.uniformBatch.getUniformBindGroup(h,!1):(f=this._bindGroupPool.pop()||new jt,this._activeBindGroups.push(f),f.setResource(h,0)),l.bindGroup=f,this._currentGlobalUniformData=l}push(e){this.bind(e),this._globalUniformDataStack[this._stackIndex++]=this._currentGlobalUniformData}pop(){this._currentGlobalUniformData=this._globalUniformDataStack[--this._stackIndex-1],this._renderer.type===Q.WEBGL&&this._currentGlobalUniformData.bindGroup.resources[0].update()}get bindGroup(){return this._currentGlobalUniformData.bindGroup}get globalUniformData(){return this._currentGlobalUniformData}get uniformGroup(){return this._currentGlobalUniformData.bindGroup.resources[0]}_createUniforms(){return new le({uProjectionMatrix:{value:new R,type:"mat3x3<f32>"},uWorldTransformMatrix:{value:new R,type:"mat3x3<f32>"},uWorldColorAlpha:{value:new Float32Array(4),type:"vec4<f32>"},uResolution:{value:[0,0],type:"vec2<f32>"}},{isStatic:!0})}destroy(){this._renderer=null,this._globalUniformDataStack.length=0,this._uniformsPool.length=0,this._activeUniforms.length=0,this._bindGroupPool.length=0,this._activeBindGroups.length=0,this._currentGlobalUniformData=null}}bt.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"globalUniforms"};let Yr=1;class vt{constructor(){this._tasks=[],this._offset=0}init(){be.system.add(this._update,this)}repeat(e,t,r=!0){const s=Yr++;let i=0;return r&&(this._offset+=1e3,i=this._offset),this._tasks.push({func:e,duration:t,start:performance.now(),offset:i,last:performance.now(),repeat:!0,id:s}),s}cancel(e){for(let t=0;t<this._tasks.length;t++)if(this._tasks[t].id===e){this._tasks.splice(t,1);return}}_update(){const e=performance.now();for(let t=0;t<this._tasks.length;t++){const r=this._tasks[t];if(e-r.offset-r.last>=r.duration){const s=e-r.start;r.func(s),r.last=e}}}destroy(){be.system.remove(this._update,this),this._tasks.length=0}}vt.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"scheduler",priority:0};let He=!1;function Kr(n){if(!He){if(oe.get().getNavigator().userAgent.toLowerCase().indexOf("chrome")>-1){const e=[`%c  %c  %c  %c  %c PixiJS %c v${ve} (${n}) http://www.pixijs.com/

`,"background: #E72264; padding:5px 0;","background: #6CA2EA; padding:5px 0;","background: #B5D33D; padding:5px 0;","background: #FED23F; padding:5px 0;","color: #FFFFFF; background: #E72264; padding:5px 0;","color: #E72264; background: #FFFFFF; padding:5px 0;"];globalThis.console.log(...e)}else globalThis.console&&globalThis.console.log(`PixiJS ${ve} - ${n} - http://www.pixijs.com/`);He=!0}}class pe{constructor(e){this._renderer=e}init(e){if(e.hello){let t=this._renderer.name;this._renderer.type===Q.WEBGL&&(t+=` ${this._renderer.context.webGLVersion}`),Kr(t)}}}pe.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"hello",priority:-2};pe.defaultOptions={hello:!1};const me=class yt{constructor(e){this._renderer=e}init(e){e={...yt.defaultOptions,...e},this.maxUnusedTime=e.renderableGCMaxUnusedTime}get enabled(){return b("8.15.0","RenderableGCSystem.enabled is deprecated, please use the GCSystem.enabled instead."),this._renderer.gc.enabled}set enabled(e){b("8.15.0","RenderableGCSystem.enabled is deprecated, please use the GCSystem.enabled instead."),this._renderer.gc.enabled=e}addManagedHash(e,t){b("8.15.0","RenderableGCSystem.addManagedHash is deprecated, please use the GCSystem.addCollection instead."),this._renderer.gc.addCollection(e,t,"hash")}addManagedArray(e,t){b("8.15.0","RenderableGCSystem.addManagedArray is deprecated, please use the GCSystem.addCollection instead."),this._renderer.gc.addCollection(e,t,"array")}addRenderable(e){b("8.15.0","RenderableGCSystem.addRenderable is deprecated, please use the GCSystem instead."),this._renderer.gc.addResource(e,"renderable")}run(){b("8.15.0","RenderableGCSystem.run is deprecated, please use the GCSystem instead."),this._renderer.gc.run()}destroy(){this._renderer=null}};me.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"renderableGC",priority:0};me.defaultOptions={renderableGCActive:!0,renderableGCMaxUnusedTime:6e4,renderableGCFrequency:3e4};let qr=me;const ge=class j{get count(){return this._renderer.tick}get checkCount(){return this._checkCount}set checkCount(e){b("8.15.0","TextureGCSystem.run is deprecated, please use the GCSystem instead."),this._checkCount=e}get maxIdle(){return this._renderer.gc.maxUnusedTime/1e3*60}set maxIdle(e){b("8.15.0","TextureGCSystem.run is deprecated, please use the GCSystem instead."),this._renderer.gc.maxUnusedTime=e/60*1e3}get checkCountMax(){return Math.floor(this._renderer.gc._frequency/1e3)}set checkCountMax(e){b("8.15.0","TextureGCSystem.run is deprecated, please use the GCSystem instead.")}get active(){return this._renderer.gc.enabled}set active(e){b("8.15.0","TextureGCSystem.run is deprecated, please use the GCSystem instead."),this._renderer.gc.enabled=e}constructor(e){this._renderer=e,this._checkCount=0}init(e){e.textureGCActive!==j.defaultOptions.textureGCActive&&(this.active=e.textureGCActive),e.textureGCMaxIdle!==j.defaultOptions.textureGCMaxIdle&&(this.maxIdle=e.textureGCMaxIdle),e.textureGCCheckCountMax!==j.defaultOptions.textureGCCheckCountMax&&(this.checkCountMax=e.textureGCCheckCountMax)}run(){b("8.15.0","TextureGCSystem.run is deprecated, please use the GCSystem instead."),this._renderer.gc.run()}destroy(){this._renderer=null}};ge.extension={type:[u.WebGLSystem,u.WebGPUSystem],name:"textureGC"};ge.defaultOptions={textureGCActive:!0,textureGCAMaxIdle:null,textureGCMaxIdle:3600,textureGCCheckCountMax:600};let Qr=ge;const St=class Tt extends Dt{constructor(e={}){super(),this.uid=Ve("renderTarget"),this.colorAttachments=[],this.dirtyId=0,this.isRoot=!1,this._size=new Float32Array(2),this._managedColorTextures=!1,this._depth=!1,this._stencil=!1,this._colorTextures=null;const t="colorAttachments"in e?e:this._normalizeOptions(e);if(this.isRoot=t.isRoot??!1,this.label=t.label,this.colorAttachments=t.colorAttachments,this.depthStencilAttachment=t.depthStencilAttachment,this.depthStencilAttachment){const r=this.depthStencilAttachment.texture.format;this._depth||(this._depth=r.includes("depth")),this._stencil||(this._stencil=r.includes("stencil"))}if(this.colorAttachments.length===0&&!this.depthStencilAttachment)throw new Error("[RenderTarget] no color textures or depth textures were provided. Provide a depthStencilTexture or set depth/stencil to true when using colorTextures: 0.");if(this.colorAttachments.length>0){const r=this.colorTexture;this.resize(r.width,r.height,r._resolution)}this.sizeSource&&this.sizeSource.on("resize",this.onSourceResize,this)}_normalizeOptions(e){const t={...Tt.defaultOptions,...e},r=[];let s;if(typeof t.colorTextures=="number"){if(t.colorTextures>0){this._managedColorTextures=!0;for(let a=0;a<t.colorTextures;a++)r.push({texture:new H({width:t.width,height:t.height,resolution:t.resolution,antialias:t.antialias}),loadOp:"clear",storeOp:"store"})}}else t.colorTextures.forEach(a=>{r.push({texture:a.source,loadOp:"clear",storeOp:"store"})});const i=t.depthStencilTexture===!0;if(this._depth=!!(t.depth||i),this._stencil=!!(t.stencil||i),t.depthStencilTexture instanceof C||t.depthStencilTexture instanceof H){if(t.isRoot)throw new Error("[RenderTarget] cannot attach a depth-stencil texture to the screen — the canvas owns its own depth/stencil buffers. Render to a texture target instead.");s={texture:t.depthStencilTexture.source}}else(i&&!t.isRoot||(t.stencil||t.depth)&&r.length===0)&&(s=this._createDepthStencilTexture(t.width,t.height,t.resolution));return{colorAttachments:r,depthStencilAttachment:s,isRoot:t.isRoot,label:t.label}}get size(){const e=this._size;return e[0]=this.pixelWidth,e[1]=this.pixelHeight,e}get width(){return this.sizeSource.width}get height(){return this.sizeSource.height}get pixelWidth(){return this.sizeSource.pixelWidth}get pixelHeight(){return this.sizeSource.pixelHeight}get resolution(){return this.sizeSource._resolution}get colorTextures(){return this._colorTextures||(this._colorTextures=this.colorAttachments.map(e=>e.texture)),this._colorTextures}get depthStencilTexture(){var e;return((e=this.depthStencilAttachment)==null?void 0:e.texture)??null}get depth(){return this._depth}get stencil(){return this._stencil}get colorTexture(){var e;return(e=this.colorAttachments[0])==null?void 0:e.texture}get sizeSource(){var e,t;return((e=this.colorAttachments[0])==null?void 0:e.texture)??((t=this.depthStencilAttachment)==null?void 0:t.texture)}onSourceResize(e){this.resize(e.width,e.height,e._resolution,!0)}ensureDepthStencilTexture(){this._createDepthStencilTexture(this.sizeSource.width,this.sizeSource.height,this.sizeSource._resolution),this._depth=!0,this._stencil=!0}resize(e,t,r=this.resolution,s=!1){if(this.dirtyId++,this.colorAttachments.forEach((i,a)=>{s&&a===0||i.texture.resize(e,t,r)}),this.depthStencilAttachment){if(s&&this.colorAttachments.length===0)return;this.depthStencilAttachment.texture.resize(e,t,r)}}destroy(){!this.colorAttachments&&!this.depthStencilAttachment||(this.emit("destroy",this),this.sizeSource.off("resize",this.onSourceResize,this),this._managedColorTextures&&this.colorAttachments.forEach(e=>{e.texture.destroy()}),this.depthStencilAttachment&&(this.depthStencilAttachment.texture.destroy(),delete this.depthStencilAttachment),this.colorAttachments=null,this._colorTextures=null,this.removeAllListeners())}_createDepthStencilTexture(e,t,r){return this.depthStencilAttachment??(this.depthStencilAttachment={texture:new H({width:e,height:t,resolution:r,format:"depth24plus-stencil8",autoGenerateMipmaps:!1,antialias:!1,mipLevelCount:1})}),this.depthStencilAttachment}};St.defaultOptions={width:0,height:0,resolution:1,colorTextures:1,stencil:!1,depth:!1,antialias:!1,isRoot:!1};let N=St;const E=new Map;Le.register(E);function Ct(n,e){if(!E.has(n)){const t=new C({source:new re({resource:n,...e})}),r=()=>{E.get(n)===t&&E.delete(n)};t.once("destroy",r),t.source.once("destroy",r),E.set(n,t)}return E.get(n)}const xe=class kt{get autoDensity(){return this.texture.source.autoDensity}set autoDensity(e){this.texture.source.autoDensity=e}get resolution(){return this.texture.source._resolution}set resolution(e){this.texture.source.resize(this.texture.source.width,this.texture.source.height,e)}constructor(e){this._renderer=e}init(e){e={...kt.defaultOptions,...e},e.view&&(b(Et,"ViewSystem.view has been renamed to ViewSystem.canvas"),e.canvas=e.view),this.screen=new V(0,0,e.width,e.height),this.canvas=e.canvas||oe.get().createCanvas(),this.antialias=!!e.antialias;const{depth:t,...r}=e;this.texture=Ct(this.canvas,r),this.renderTarget=new N({colorTextures:[this.texture],depth:!!t,isRoot:!0}),this.texture.source.transparent=e.backgroundAlpha<1,this.texture.source.on("resize",this._updateScreenSize,this),this.resolution=e.resolution,this._updateScreenSize()}resize(e,t,r){this.texture.source.resize(e,t,r),this.screen.width=this.texture.frame.width,this.screen.height=this.texture.frame.height}destroy(e=!1){(typeof e=="boolean"?e:!!(e!=null&&e.removeView))&&this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas),this.texture.source.off("resize",this._updateScreenSize,this),U.removeScreen(this._renderer.uid),Se.removeScreen(this._renderer.uid),this.texture.destroy()}_updateScreenSize(){const{pixelWidth:e,pixelHeight:t}=this.texture.source,r=this._renderer.uid;U.setScreenSize(r,e,t),Se.setScreenSize(r,e,t)}};xe.extension={type:[u.WebGLSystem,u.WebGPUSystem,u.CanvasSystem],name:"view",priority:0};xe.defaultOptions={width:800,height:600,autoDensity:!1,antialias:!1};let Xr=xe;const ss=[Hr,bt,pe,Xr,pt,Nr,Qr,xt,Vr,zt,qr,vt],ns=[ht,nt,ct,ut,it,ot,at,lt];function Jr(n,e,t,r,s,i){const a=i?1:-1;return n.identity(),n.a=1/r*2,n.d=a*(1/s*2),n.tx=-1-e*n.a,n.ty=-a-t*n.d,n}function Zr(n){if(n.colorAttachments.length===0)return!1;const e=n.colorTexture.resource;return globalThis.HTMLCanvasElement&&e instanceof HTMLCanvasElement&&document.body.contains(e)}class is{constructor(e){this.rootViewPort=new V,this.viewport=new V,this.onRenderTargetChange=new Ft("onRenderTargetChange"),this.projectionMatrix=new R,this.defaultClearColor=[0,0,0,0],this._renderSurfaceToRenderTargetHash=new Map,this._gpuRenderTargetHash=Object.create(null),this._renderTargetStack=[],this._bindState={target:null,frame:void 0,mipLevel:0,layer:0,flipY:!1},this._bindFrame=new V,this._renderer=e,e.gc.addCollection(this,"_gpuRenderTargetHash","hash")}get renderSurface(){return this._bindState.target}get mipLevel(){return this._bindState.mipLevel}get layer(){return this._bindState.layer}finishRenderPass(){this.adaptor.finishRenderPass(this.renderTarget)}renderStart(e){var t,r;this._renderTargetStack.length=0,this.push(e),this.rootViewPort.copyFrom(this.viewport),this.rootRenderTarget=this.renderTarget,this.renderingToScreen=Zr(this.rootRenderTarget),(r=(t=this.adaptor).prerender)==null||r.call(t,this.rootRenderTarget)}postrender(){var e,t;(t=(e=this.adaptor).postrender)==null||t.call(e,this.rootRenderTarget)}bind(e,t=!0,r,s,i=0,a=0,o){var x,v;let l;"target"in e?l=e:(b("8.20.0","RenderTargetSystem.bind: positional arguments are deprecated, please use an options object instead: bind({ target, clear, clearColor, frame, mipLevel, layer, flipY })"),l={target:e,clear:t,clearColor:r,frame:s,mipLevel:i,layer:a,flipY:o});const h=l.target;t=l.clear??!0,r=l.clearColor,i=(l.mipLevel??0)|0,a=(l.layer??0)|0,o=l.flipY,s=l.frame;const c=this.getRenderTarget(h),f=this.renderTarget!==c||!!c.flipY!=!!o;this.renderTarget=c;const m=this.getGpuRenderTarget(c);(c.pixelWidth!==m.width||c.pixelHeight!==m.height)&&(this.adaptor.resizeGpuRenderTarget(c),m.width=c.pixelWidth,m.height=c.pixelHeight);const p=((x=c.colorAttachments[0])==null?void 0:x.texture)||((v=c.depthStencilAttachment)==null?void 0:v.texture),g=this.viewport,S=p.dimension==="3d"?Math.max(p.depth>>i,1):p.depthOrArrayLayers;if(a<0||a>=S)throw new Error(`[RenderTargetSystem] layer ${a} is out of bounds (layer count=${S}).`);const _=this._bindState;_.target=h,_.frame=s?this._bindFrame.copyFrom(s):void 0,_.mipLevel=i,_.layer=a,_.flipY=o;const d=Math.max(p.pixelWidth>>i,1),T=Math.max(p.pixelHeight>>i,1);if(!s&&h instanceof C&&(s=h.frame),s){const y=p._resolution,M=1<<Math.max(i,0),wt=s.x*y+.5|0,Rt=s.y*y+.5|0,Mt=s.width*y+.5|0,Bt=s.height*y+.5|0;let B=Math.floor(wt/M),A=Math.floor(Rt/M),G=Math.ceil(Mt/M),I=Math.ceil(Bt/M);B<0&&(G+=B,B=0),A<0&&(I+=A,A=0),B=Math.min(B,d-1),A=Math.min(A,T-1),G=Math.min(G,d-B),I=Math.min(I,T-A),G=Math.max(G,1),I=Math.max(I,1),g.x=B,g.y=A,g.width=G,g.height=I}else g.x=0,g.y=0,g.width=d,g.height=T;return c.flipY=o,Jr(this.projectionMatrix,0,0,g.width/p.resolution,g.height/p.resolution,!c.isRoot!=!!c.flipY),this.adaptor.startRenderPass(c,t,r,g,i,a),f&&this.onRenderTargetChange.emit(c),c}getBindState(e){if(!this.renderTarget)throw new Error("[RenderTargetSystem] getBindState is only valid while a render surface is bound");const t=this._bindState;return e??(e={}),e.target=t.target,e.clear=$.NONE,e.clearColor=void 0,t.frame?e.frame?e.frame.copyFrom(t.frame):e.frame=t.frame.clone():e.frame=void 0,e.mipLevel=t.mipLevel,e.layer=t.layer,e.flipY=!!t.flipY,e}isFrontFaceInverted(e,t){if(!e){if(e=this.renderTarget,!e)return!1;t=e.flipY}return!!t!=(this._renderer.type===Q.WEBGL&&!e.isRoot)}get frontFaceInverted(){return b(Ht,"RenderTargetSystem.frontFaceInverted is deprecated, use isFrontFaceInverted() instead"),this.isFrontFaceInverted()}clear(e,t=$.ALL,r,s=this.mipLevel,i=this.layer){t&&(e&&(e=this.getRenderTarget(e)),this.adaptor.clear(e||this.renderTarget,t,r,this.viewport,s,i))}contextChange(){this._gpuRenderTargetHash=Object.create(null)}push(e,t=$.ALL,r,s,i=0,a=0,o){let l;"target"in e?l=e:(b("8.20.0","RenderTargetSystem.push: positional arguments are deprecated, please use an options object instead: push({ target, clear, clearColor, frame, mipLevel, layer, flipY })"),l={target:e,clear:t,clearColor:r,frame:s,mipLevel:i,layer:a,flipY:o});const h=this.bind(l);return this._renderTargetStack.push({target:l.target,clear:!1,clearColor:void 0,frame:l.frame?l.frame.clone():void 0,mipLevel:l.mipLevel,layer:l.layer,flipY:l.flipY}),h}pop(){this._renderTargetStack.pop();const e=this._renderTargetStack[this._renderTargetStack.length-1];if(!e)throw new Error("[RenderTargetSystem] pop: no previous binding to restore (unbalanced pop)");return this.bind(e)}getRenderTarget(e){return e.isTexture&&(e=e.source),this._renderSurfaceToRenderTargetHash.get(e)??this._initRenderTarget(e)}copyToTexture(e,t,r,s,i){const a=this.getRenderTarget(e);r.x<0&&(s.width+=r.x,i.x-=r.x,r.x=0),r.y<0&&(s.height+=r.y,i.y-=r.y,r.y=0);const{pixelWidth:o,pixelHeight:l}=a;return s.width=Math.min(s.width,o-r.x),s.height=Math.min(s.height,l-r.y),this.adaptor.copyToTexture(a,t,r,s,i)}copyDepthTexture(e,t,r,s,i={x:0,y:0}){const a=this.getRenderTarget(e);if(!a.depthStencilAttachment){P("[RenderTargetSystem] copyDepthTexture: the source render target has no depth attachment to copy from");return}const o=t.source;if(!o.format.includes("depth")&&!o.format.includes("stencil")){P(`[RenderTargetSystem] copyDepthTexture: the destination texture must have a depth/stencil format (got '${o.format}')`);return}let l=r.x,h=r.y,c=i.x,f=i.y,m=s.width,p=s.height;l<0&&(m+=l,c-=l,l=0),h<0&&(p+=h,f-=h,h=0),m=Math.min(m,a.pixelWidth-l),p=Math.min(p,a.pixelHeight-h),m=Math.min(m,o.pixelWidth-c),p=Math.min(p,o.pixelHeight-f),!(m<=0||p<=0)&&this.adaptor.copyDepthTexture(a,t,{x:l,y:h},{width:m,height:p},{x:c,y:f})}ensureDepthStencil(){if(!this.renderTarget.stencil){if(this.renderTarget.depthStencilTexture){P(`[RenderTargetSystem] a stencil mask is being used, but the render target's depthStencilTexture format '${this.renderTarget.depthStencilTexture.format}' has no stencil aspect, so masking cannot work here. Use a 'depth24plus-stencil8' texture instead.`);return}this.renderTarget._depth=!0,this.renderTarget._stencil=!0,this.adaptor.startRenderPass(this.renderTarget,!1,null,this.viewport,0,this.layer)}}destroy(){this._renderer=null,this._renderSurfaceToRenderTargetHash.forEach((e,t)=>{e!==t?this._releaseRenderTarget(t,e):e.off("destroy",this._onRenderTargetDestroy,this)}),this._renderSurfaceToRenderTargetHash.clear();for(const e of Object.values(this._gpuRenderTargetHash))e&&this.adaptor.destroyGpuRenderTarget(e);this._gpuRenderTargetHash=Object.create(null)}_initRenderTarget(e){let t=null;if(re.test(e)&&(e=Ct(e).source),e instanceof N)t=e,e.once("destroy",this._onRenderTargetDestroy,this);else if(e instanceof H){const r=e.format;t=r.includes("depth")||r.includes("stencil")?new N({colorTextures:0,depthStencilTexture:e}):new N({colorTextures:[e]}),e.source instanceof re&&(t.isRoot=!0),e.once("destroy",this._onRenderSurfaceDestroy,this)}return this._renderSurfaceToRenderTargetHash.set(e,t),t}_onRenderSurfaceDestroy(e){const t=this._renderSurfaceToRenderTargetHash.get(e);t&&this._releaseRenderTarget(e,t)}_onRenderTargetDestroy(e){this._renderSurfaceToRenderTargetHash.delete(e),this._releaseGpuRenderTarget(e)}_releaseRenderTarget(e,t){t.destroy(),this._renderSurfaceToRenderTargetHash.delete(e),e.off("destroy",this._onRenderSurfaceDestroy,this),this._releaseGpuRenderTarget(t)}_releaseGpuRenderTarget(e){const t=this._gpuRenderTargetHash[e.uid];t&&(this._gpuRenderTargetHash[e.uid]=null,this.adaptor.destroyGpuRenderTarget(t))}getGpuRenderTarget(e){return this._gpuRenderTargetHash[e.uid]||(this._gpuRenderTargetHash[e.uid]=this.adaptor.initGpuRenderTarget(e))}resetState(){this.renderTarget=null,this._bindState.target=null}}export{it as A,ht as B,lt as C,tt as D,rs as G,is as R,k as S,br as a,ss as b,xr as c,ns as d,qt as e,Ce as f,Tr as g,_r as h,vr as i,Rr as j,kr as k,Mr as l,Ur as m,nt as n,ct as o,ut as p,wr as r};
