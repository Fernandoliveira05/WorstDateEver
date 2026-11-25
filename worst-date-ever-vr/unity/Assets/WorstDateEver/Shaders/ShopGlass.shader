Shader "WorstDateEver/ShopGlass"
{
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            struct AppData { float4 vertex : POSITION; float3 normal : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Interpolators
            {
                float4 clip : SV_POSITION;
                float3 world : TEXCOORD0;
                float3 normal : TEXCOORD1;
                UNITY_VERTEX_OUTPUT_STEREO
            };
            Interpolators vert(AppData v)
            {
                Interpolators o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Interpolators,o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.clip=UnityObjectToClipPos(v.vertex);
                o.world=mul(unity_ObjectToWorld,v.vertex).xyz;
                o.normal=UnityObjectToWorldNormal(v.normal);
                return o;
            }
            half4 frag(Interpolators i) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                half3 eye=normalize(UnityWorldSpaceViewDir(i.world));
                half3 normal=normalize(i.normal);
                half grazing=pow(1-saturate(abs(dot(eye,normal))),3);
                half3 reflected=reflect(-eye,normal);
                half horizon=smoothstep(.025,.12,reflected.y);
                half streak=saturate(1-abs(i.world.y+i.world.x*.15-1.67)*10)*.10;
                half3 tint=lerp(half3(.11,.21,.23),half3(.46,.61,.70),horizon);
                return half4(tint+streak,.09+grazing*.32+streak);
            }
            ENDCG
        }
    }
}
