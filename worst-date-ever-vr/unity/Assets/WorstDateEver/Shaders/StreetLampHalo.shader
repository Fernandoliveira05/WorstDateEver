Shader "WorstDateEver/StreetLampHalo"
{
    SubShader
    {
        Tags { "Queue"="Transparent+5" "RenderType"="Transparent" }
        Blend One One
        ZWrite Off
        Cull Off
        ColorMask RGB
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            struct AppData { float4 vertex : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Interpolators { float4 clip : SV_POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };
            Interpolators vert(AppData v)
            {
                Interpolators o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Interpolators,o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                float3 center=UnityObjectToViewPos(float3(0,0,0));
                float scale=length(unity_ObjectToWorld._m00_m10_m20);
                center.xy+=v.vertex.xy*scale;
                o.clip=mul(UNITY_MATRIX_P,float4(center,1));
                o.uv=v.uv*2-1;
                return o;
            }
            half falloff(half2 uv,half width) { return exp2(-dot(uv,uv)*width); }
            half4 frag(Interpolators i) : SV_Target
            {
                half2 uv=i.uv;
                half edge=1-smoothstep(.63,1,length(uv));
                half core=falloff(uv,95);
                half halo=falloff(uv,9)*.18;
                half fringe=falloff(uv+half2(.058,.025),38)-falloff(uv-half2(.058,.025),38);
                half3 warmth=half3(1,.64,.29)*(core*.63+halo);
                warmth+=half3(max(fringe,0),.03*abs(fringe),max(-fringe,0)*.61)*.20;
                return half4(warmth*edge,0);
            }
            ENDCG
        }
    }
}
