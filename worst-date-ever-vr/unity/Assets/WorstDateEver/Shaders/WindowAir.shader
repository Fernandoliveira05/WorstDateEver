Shader "WorstDateEver/WindowAir"
{
    Properties
    {
        _Tint ("Sun color", Color) = (1,0.76,0.46,0.13)
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Pass
        {
            Cull Off
            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"
            fixed4 _Tint;
            struct In { float4 vertex : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Out { float4 position : SV_POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };
            Out vert(In v)
            {
                Out o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(Out, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.position = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }
            fixed4 frag(Out i) : SV_Target
            {
                float edge = smoothstep(0,0.24,i.uv.x) * (1-smoothstep(.76,1,i.uv.x));
                float along = smoothstep(0,.14,i.uv.y) * (1-smoothstep(.26,1,i.uv.y));
                return fixed4(_Tint.rgb,_Tint.a * edge * along);
            }
            ENDCG
        }
    }
}
