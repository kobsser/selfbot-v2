const api={
  async request(method,path,body=null){
    const opts={method,credentials:'include',headers:{'Content-Type':'application/json'}};
    if(body)opts.body=JSON.stringify(body);
    try{const r=await fetch(path,opts);const data=await r.json().catch(()=>({}));
      return{ok:r.ok,status:r.status,data};}
    catch(e){return{ok:false,status:0,data:{error:e.message}};}
  },
  get(p){return this.request('GET',p)},
  post(p,b){return this.request('POST',p,b)},
  put(p,b){return this.request('PUT',p,b)},
  del(p){return this.request('DELETE',p)}
};
